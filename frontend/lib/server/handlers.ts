import { SearchPolicyResultSchema, SourceRefSchema, type PolicyMatch } from "@/lib/contracts";
import { ensureSession, isSameOrigin, jsonWithSession, sessionFromRequest } from "@/lib/session/http";
import { DEMO_CUSTOMERS, isDemoCustomerId } from "@/lib/session/demo-customers";
import { resolveDataRef, switchCustomer } from "@/lib/session/store";

function errorBody(code: string, message: string) {
  return { status: "error", data: null, error: { code, message } };
}

export function getDemoAccount(req: Request): Response {
  const { session, setCookie } = ensureSession(req);
  return jsonWithSession(
    { customer_id: session.customerId, display_name: DEMO_CUSTOMERS[session.customerId] ?? session.customerId },
    setCookie,
  );
}

/** 切換 Demo 客戶：同源 Origin、strict 白名單；成功即清除該 Session 的工具快取。 */
export async function setDemoAccount(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) {
    return jsonWithSession(errorBody("FORBIDDEN", "請求來源不被允許。"), null, 403);
  }
  const body: unknown = await req.json().catch(() => null);
  const keys = body && typeof body === "object" ? Object.keys(body) : [];
  const customerId = (body as { customer_id?: unknown } | null)?.customer_id;
  if (keys.length !== 1 || !isDemoCustomerId(customerId)) {
    return jsonWithSession(errorBody("VALIDATION_ERROR", "只能選擇五個 Demo 客戶之一。"), null, 422);
  }
  const { session, setCookie } = ensureSession(req);
  switchCustomer(session, customerId);
  return jsonWithSession({ customer_id: customerId, display_name: DEMO_CUSTOMERS[customerId] }, setCookie);
}

/**
 * PolicyReference 以此解析來源：只回傳「本 Session 的 search_policy 結果中實際出現」的片段，
 * 模型填入的 source_refs 若未被檢索過就不會有內容（不捏造引用）。
 */
export function getPolicyRefs(req: Request): Response {
  const session = sessionFromRequest(req);
  if (!session) return jsonWithSession(errorBody("NOT_FOUND", "資料已失效，請重新查詢。"), null, 404);
  const refs = (new URL(req.url).searchParams.get("refs") ?? "").split(",").filter(Boolean);
  if (refs.length === 0 || refs.length > 10 || !refs.every((r) => SourceRefSchema.safeParse(r).success)) {
    return jsonWithSession(errorBody("VALIDATION_ERROR", "來源引用格式無效。"), null, 422);
  }
  const wanted = new Set(refs);
  const found = new Map<string, PolicyMatch>();
  for (const entry of session.dataRefs.values()) {
    if (entry.tool !== "search_policy") continue;
    const parsed = SearchPolicyResultSchema.safeParse(entry.envelope.data);
    if (!parsed.success) continue;
    for (const m of parsed.data.matches) {
      const id = `${m.document_id}#${m.section_id}`;
      if (wanted.has(id)) found.set(id, m);
    }
  }
  return jsonWithSession({ status: "success", data: { matches: refs.flatMap((r) => (found.has(r) ? [found.get(r)!] : [])) }, error: null }, null);
}

/** GenUI 卡片以此解析 Session 內可信 data_ref；Browser 取得的永遠是伺服器快取的結果。 */
export function getDataRef(req: Request, ref: string): Response {
  const entry = resolveDataRef(sessionFromRequest(req), ref);
  if (!entry) {
    return jsonWithSession(
      { status: "error", data: null, error: { code: "NOT_FOUND", message: "資料已失效，請重新查詢。" } },
      null,
      404,
    );
  }
  return jsonWithSession(entry.envelope, null);
}
