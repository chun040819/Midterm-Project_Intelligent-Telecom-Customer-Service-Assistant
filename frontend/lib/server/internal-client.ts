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

/** 單次內部呼叫上限；整輪預算由 signal 負責取消。 */
const INTERNAL_TIMEOUT_MS = 15_000;

type Deps = { fetch?: FetchLike; baseUrl?: string; token?: string; timeoutMs?: number; signal?: AbortSignal };

/** Next.js Server → FastAPI。身分標頭只由這裡依 Session 產生，絕不採用 Browser／模型提供的值。 */
export function callInternalTool(
  tool: string,
  args: Record<string, unknown>,
  customerId: string,
  deps: Deps = {},
): Promise<ToolEnvelope<unknown>> {
  return post(`/internal/tools/${tool}`, { arguments: args }, customerId, deps);
}

/** 受信任 Action 路徑（寫入授權 Context）：只給 confirm Route 在驗證 Session／Quote 後呼叫。 */
export function callInternalAction(
  action: "confirm_plan_change" | "find_plan_change_request",
  body: Record<string, unknown>,
  customerId: string,
  deps: Deps = {},
): Promise<ToolEnvelope<unknown>> {
  return post(`/internal/actions/${action}`, body, customerId, deps);
}

async function post(
  path: string,
  payload: unknown,
  customerId: string,
  deps: Deps,
): Promise<ToolEnvelope<unknown>> {
  // 整輪預算已用完：禁止再派送新的內部請求。
  if (deps.signal?.aborted) return errorEnvelope("INTERNAL_ERROR", "目前系統無法完成這項操作，請稍後再試。");
  const doFetch = deps.fetch ?? fetch;
  const baseUrl = deps.baseUrl ?? process.env.FASTAPI_BASE_URL ?? "http://127.0.0.1:8000";
  const token = deps.token ?? process.env.INTERNAL_SERVICE_TOKEN ?? "";
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? INTERNAL_TIMEOUT_MS);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;
  try {
    const res = await doFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
        "X-Demo-Customer-Id": customerId,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal,
    });
    const body: unknown = await res.json().catch(() => null);
    // 非 2xx 也應是 Envelope（SPEC §6.4）；格式不符一律視為內部錯誤，不推測成功。
    if (isEnvelope(body)) return body;
    return errorEnvelope("INTERNAL_ERROR", "目前系統無法完成這項操作，請稍後再試。");
  } catch {
    return errorEnvelope("INTERNAL_ERROR", "目前系統無法完成這項操作，請稍後再試。");
  }
}
