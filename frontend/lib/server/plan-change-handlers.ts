import { isSameOrigin, jsonWithSession, sessionFromRequest } from "@/lib/session/http";
import { PlanChangeCreatedSchema } from "@/lib/contracts";
import { cancelQuote, consumeQuote, getQuoteForConfirm } from "@/lib/session/quotes";
import { callInternalAction } from "./internal-client";

type Deps = Parameters<typeof callInternalAction>[3];

function errorBody(code: string, message: string) {
  return { status: "error", data: null, error: { code, message } };
}

// System Prompt §4 固定句；SPEC §6.4：QUOTE_EXPIRED 為 409。
const QUOTE_GONE = "此方案變更評估已過期，請重新查詢並確認。";

function quoteExpired(): Response {
  return jsonWithSession(errorBody("QUOTE_EXPIRED", QUOTE_GONE), null, 409);
}

/** PlanChangeCard 以 quote_ref 解析：只回傳本 Session、目前客戶、仍有效的 Quote 的可顯示欄位。 */
export function getQuoteView(req: Request, quoteRef: string): Response {
  const quote = getQuoteForConfirm(sessionFromRequest(req), quoteRef);
  if (!quote) return jsonWithSession(errorBody("NOT_FOUND", QUOTE_GONE), null, 404);
  return jsonWithSession(
    {
      status: "success",
      data: {
        eligible: true, reason_code: null,
        current_plan_id: quote.old_plan_id, new_plan_id: quote.new_plan_id,
        current_monthly_fee: quote.current_monthly_fee, new_monthly_fee: quote.new_monthly_fee,
        monthly_delta: quote.monthly_delta, quote_id: quote.quote_id, expires_at: quote.expires_at,
        policy_refs: quote.policy_refs,
        ...(quote.status === "CONSUMED" ? { request_id: quote.request_id } : {}),
      },
      error: null,
    },
    null,
  );
}

async function readQuoteId(req: Request): Promise<string | undefined> {
  const body: unknown = await req.json().catch(() => null);
  const keys = body && typeof body === "object" ? Object.keys(body) : [];
  const id = (body as { quote_id?: unknown } | null)?.quote_id;
  return keys.length === 1 && typeof id === "string" && id.length > 0 && id.length <= 100 ? id : undefined;
}

type Gate = { session: NonNullable<ReturnType<typeof sessionFromRequest>>; quoteId: string } | Response;

/** cancel／confirm 共用前置：同源 → 請求格式 → Session。 */
async function gate(req: Request): Promise<Gate> {
  if (!isSameOrigin(req)) return jsonWithSession(errorBody("FORBIDDEN", "請求來源不被允許。"), null, 403);
  const quoteId = await readQuoteId(req);
  if (!quoteId) return jsonWithSession(errorBody("VALIDATION_ERROR", "請求格式或參數無效。"), null, 422);
  const session = sessionFromRequest(req);
  if (!session) return quoteExpired();
  return { session, quoteId };
}

/** cancel_plan_change：同源＋Session 持有有效 Quote 才失效；不建立、也不取消任何已提交申請。 */
export async function cancelPlanChange(req: Request): Promise<Response> {
  const g = await gate(req);
  if (g instanceof Response) return g;
  if (!cancelQuote(g.session, g.quoteId)) return quoteExpired();
  return jsonWithSession({ status: "success", data: { cancelled: true }, error: null }, null);
}

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404, FORBIDDEN: 403, VALIDATION_ERROR: 422, CONFLICT: 409,
  CONFIRMATION_REQUIRED: 409, QUOTE_EXPIRED: 409,
};

const UNKNOWN_OUTCOME = "目前無法確認申請是否已送出，請稍後再試；系統不會重複建立申請。";

function createdResponse(raw: unknown, forceExisting = false): { response: Response; requestId: string } | undefined {
  const parsed = PlanChangeCreatedSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const created = { ...parsed.data, already_existed: parsed.data.already_existed || forceExisting };
  const body = { status: "success", data: created, error: null };
  return { response: jsonWithSession(body, null, created.already_existed ? 200 : 201), requestId: created.request_id };
}

/**
 * confirm_plan_change：同源、Session、Quote 都通過才算受信任 Action；Quote 綁定資料（非 Browser／模型輸入）
 * 組成內部請求。FastAPI 在單一交易內先查同 Quote、再重驗訂閱／資格／Pending；commit 後才消耗 Quote。
 */
export async function confirmPlanChange(req: Request, deps?: Deps): Promise<Response> {
  const g = await gate(req);
  if (g instanceof Response) return g;
  const quote = getQuoteForConfirm(g.session, g.quoteId);
  if (!quote) return quoteExpired();

  const customerId = g.session.customerId;
  const envelope = await callInternalAction(
    "confirm_plan_change",
    {
      quote_id: quote.quote_id, subscription_id: quote.subscription_id,
      old_plan_id: quote.old_plan_id, new_plan_id: quote.new_plan_id,
    },
    customerId,
    deps,
  );

  let result = envelope.status === "success" ? createdResponse(envelope.data) : undefined;
  if (envelope.status === "error" && envelope.error.code !== "INTERNAL_ERROR") {
    return jsonWithSession(envelope, null, STATUS_BY_CODE[envelope.error.code] ?? 500);
  }
  if (!result) {
    // E10：結果不明。只查同一已授權 Quote 的既有紀錄，絕不自動重送 INSERT。
    const found = await callInternalAction("find_plan_change_request", { quote_id: quote.quote_id }, customerId, deps);
    result = found.status === "success" ? createdResponse(found.data, true) : undefined;
  }
  if (!result) return jsonWithSession(errorBody("INTERNAL_ERROR", UNKNOWN_OUTCOME), null, 500);
  // 寫入已 commit：即使確認期間被取消／過期，DB 事實優先，Quote 仍須記下確認關聯。
  if (quote.status !== "CONSUMED") consumeQuote(quote, result.requestId);
  return result.response;
}
