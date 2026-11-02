import { ensureSession, jsonWithSession, sessionFromRequest } from "@/lib/session/http";
import { resolveDataRef } from "@/lib/session/store";

const DISPLAY_NAMES: Record<string, string> = { C0001: "Demo 客戶 A" };

export function getDemoAccount(req: Request): Response {
  const { session, setCookie } = ensureSession(req);
  return jsonWithSession(
    { customer_id: session.customerId, display_name: DISPLAY_NAMES[session.customerId] ?? session.customerId },
    setCookie,
  );
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
