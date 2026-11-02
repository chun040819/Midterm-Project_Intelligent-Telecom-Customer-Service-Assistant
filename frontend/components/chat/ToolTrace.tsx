"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";

/** 可展開的 Tool trace：顯示工具名稱、參數與（伺服器回傳的）結果。 */
export function ToolTrace({ toolName, argsText, result, status, isError }: ToolCallMessagePartProps) {
  const running = status.type === "running";
  return (
    <details className="trace" data-testid="tool-trace">
      <summary>
        🔧 {toolName} · {running ? "執行中…" : isError ? "失敗" : "完成"}
      </summary>
      <pre>參數：{argsText || "{}"}</pre>
      {result !== undefined && <pre>結果：{JSON.stringify(result, null, 2)}</pre>}
    </details>
  );
}
