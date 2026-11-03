import { isSameOrigin, jsonWithSession, sessionFromRequest } from "@/lib/session/http";
import { cancelQuote, getValidQuote } from "@/lib/session/quotes";

function errorBody(code: string, message: string) {
  return { status: "error", data: null, error: { code, message } };
}

const QUOTE_GONE = "此方案變更評估已失效，請重新查詢並確認。";

/** PlanChangeCard 以 quote_ref 解析：只回傳本 Session、目前客戶、仍有效的 Quote 的可顯示欄位。 */
export function getQuoteView(req: Request, quoteRef: string): Response {
  const quote = getValidQuote(sessionFromRequest(req), quoteRef);
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

/** cancel_plan_change：同源＋Session 持有有效 Quote 才失效；不建立、也不取消任何已提交申請。 */
export async function cancelPlanChange(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return jsonWithSession(errorBody("FORBIDDEN", "請求來源不被允許。"), null, 403);
  const quoteId = await readQuoteId(req);
  if (!quoteId) return jsonWithSession(errorBody("VALIDATION_ERROR", "請求格式或參數無效。"), null, 422);
  const session = sessionFromRequest(req);
  if (!session || !cancelQuote(session, quoteId)) {
    return jsonWithSession(errorBody("NOT_FOUND", QUOTE_GONE), null, 404);
  }
  return jsonWithSession({ status: "success", data: { cancelled: true }, error: null }, null);
}

/**
 * confirm_plan_change：閘門（同源、Session、有效 Quote）已就緒，但寫入 PENDING 的功能尚未實作
 * （後續工單）。在此之前一律不寫入、不改 Quote 狀態，也絕不回報成功。
 */
export async function confirmPlanChange(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return jsonWithSession(errorBody("FORBIDDEN", "請求來源不被允許。"), null, 403);
  const quoteId = await readQuoteId(req);
  if (!quoteId) return jsonWithSession(errorBody("VALIDATION_ERROR", "請求格式或參數無效。"), null, 422);
  if (!getValidQuote(sessionFromRequest(req), quoteId)) {
    return jsonWithSession(errorBody("QUOTE_EXPIRED", QUOTE_GONE), null, 410);
  }
  return jsonWithSession(errorBody("INTERNAL_ERROR", "確認送出功能尚未開放，目前不會建立任何申請。"), null, 501);
}
