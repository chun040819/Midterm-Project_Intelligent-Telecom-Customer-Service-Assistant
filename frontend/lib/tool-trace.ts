export type TraceState = "loading" | "result" | "error";

/** Tool trace 的三態。Envelope 的 status:"error" 與傳輸層失敗都算 error，避免把失敗顯示成「完成」。 */
export function traceState(input: { running: boolean; isError: boolean; result: unknown }): TraceState {
  if (input.running) return "loading";
  const status = (input.result as { status?: unknown } | null | undefined)?.status;
  return input.isError || status === "error" ? "error" : "result";
}
