"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { traceState } from "@/lib/tool-trace";

const LABEL = { loading: "執行中…", result: "完成", error: "失敗" } as const;

/** 可展開的 Tool trace：顯示工具名稱、參數與（伺服器回傳的）結果。 */
export function ToolTrace({ toolName, argsText, result, status, isError }: ToolCallMessagePartProps) {
  const state = traceState({ running: status.type === "running", isError: Boolean(isError), result });
  return (
    <details className="trace" data-testid="tool-trace" data-state={state}>
      <summary>
        🔧 {toolName} · {LABEL[state]}
      </summary>
      <pre>參數：{argsText || "{}"}</pre>
      {result !== undefined && <pre>結果：{JSON.stringify(result, null, 2)}</pre>}
    </details>
  );
}
