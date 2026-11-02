import type { BusinessErrorCode, ToolEnvelope } from "@/lib/contracts";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function errorEnvelope(code: BusinessErrorCode, message: string): ToolEnvelope<never> {
  return { status: "error", data: null, error: { code, message } };
}

function isEnvelope(value: unknown): value is ToolEnvelope<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { status?: unknown; error?: unknown };
  return v.status === "success" || (v.status === "error" && typeof v.error === "object" && v.error !== null);
}

/** Next.js Server → FastAPI。身分標頭只由這裡依 Session 產生，絕不採用 Browser／模型提供的值。 */
export async function callInternalTool(
  tool: string,
  args: Record<string, unknown>,
  customerId: string,
  deps: { fetch?: FetchLike; baseUrl?: string; token?: string } = {},
): Promise<ToolEnvelope<unknown>> {
  const doFetch = deps.fetch ?? fetch;
  const baseUrl = deps.baseUrl ?? process.env.FASTAPI_BASE_URL ?? "http://127.0.0.1:8000";
  const token = deps.token ?? process.env.INTERNAL_SERVICE_TOKEN ?? "";
  try {
    const res = await doFetch(`${baseUrl}/internal/tools/${tool}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
        "X-Demo-Customer-Id": customerId,
      },
      body: JSON.stringify({ arguments: args }),
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => null);
    // 非 2xx 也應是 Envelope（SPEC §6.4）；格式不符一律視為內部錯誤，不推測成功。
    if (isEnvelope(body)) return body;
    return errorEnvelope("INTERNAL_ERROR", "目前系統無法完成這項操作，請稍後再試。");
  } catch {
    return errorEnvelope("INTERNAL_ERROR", "目前系統無法完成這項操作，請稍後再試。");
  }
}
