import { toolInputSchemas, type ToolEnvelope, type ToolName } from "@/lib/contracts";
import { registerDataRef, type DemoSession } from "@/lib/session/store";
import { callInternalTool } from "./internal-client";

export type ExecutedTool = ToolEnvelope<unknown> & { data_ref: string | null };

type Deps = Parameters<typeof callInternalTool>[3];

/**
 * 八個業務工具的 Next.js 端執行入口（目前實作 get_my_subscription）。
 * 客戶身分只取自 session；模型輸入先經 strict Zod 驗證，失敗時不會發出任何內部請求。
 */
export async function executeReadTool(
  session: DemoSession,
  name: ToolName,
  rawArgs: unknown,
  deps?: Deps,
): Promise<ExecutedTool> {
  const parsed = toolInputSchemas[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return {
      status: "error", data: null, data_ref: null,
      error: { code: "VALIDATION_ERROR", message: "工具參數無效。" },
    };
  }
  let envelope = await callInternalTool(name, parsed.data, session.customerId, deps);
  // 只讀工具可重試一次（SPEC §10.1）
  if (envelope.status === "error" && envelope.error.code === "INTERNAL_ERROR") {
    envelope = await callInternalTool(name, parsed.data, session.customerId, deps);
  }
  const data_ref = envelope.status === "success" ? registerDataRef(session, name, envelope) : null;
  return { ...envelope, data_ref };
}
