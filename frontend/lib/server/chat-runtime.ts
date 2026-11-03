import type { UIMessageChunk } from "ai";

/** SPEC §10.1：每輪最多 6 個工具執行步驟、60 秒總時間預算。 */
export const MAX_TOOL_STEPS = 6;
export const TURN_BUDGET_MS = 60_000;

export const TIMEOUT_MESSAGE = "這次處理超過時間上限，不再執行新的步驟；請稍後再試，或把問題拆小一點。";
export const PROVIDER_UNAVAILABLE_MESSAGE = "目前 AI 服務不可用，請稍後再試。這次沒有完成任何操作。";

function isTimeout(value: unknown): boolean {
  if (value instanceof Error) return value.name === "TimeoutError" || value.name === "AbortError";
  return typeof value === "string" && /TimeoutError/.test(value);
}

/** 串流錯誤的使用者訊息：固定句，不含 Provider 原文、金鑰或內部細節。 */
export function describeStreamError(error: unknown): string {
  return isTimeout(error) ? TIMEOUT_MESSAGE : PROVIDER_UNAVAILABLE_MESSAGE;
}

/** 工具步驟用完後的下一步只能產生文字，禁止再派送工具。 */
export function prepareStep({ stepNumber }: { stepNumber: number }): { toolChoice: "none" } | undefined {
  return stepNumber >= MAX_TOOL_STEPS ? { toolChoice: "none" } : undefined;
}

/**
 * 保護送往客戶端的 UI stream，讓失敗一定看得見：
 * - AI SDK 逾時只送 abort chunk、客戶端看不到任何訊息 → 轉成 error chunk；
 * - Provider 連線中途斷掉時 stream 會直接丟例外（瀏覽器只會看到「網路錯誤」）→ 補一個固定句 error chunk 後正常結束。
 */
export function guardUIStream(stream: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
  const reader = stream.getReader();
  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) return controller.close();
        const reason = (value as { reason?: unknown }).reason;
        controller.enqueue(
          value.type === "abort" && isTimeout(reason) ? { type: "error", errorText: TIMEOUT_MESSAGE } : value,
        );
      } catch (error) {
        controller.enqueue({ type: "error", errorText: describeStreamError(error) });
        controller.close();
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}
