import {
  PlanChangeEstimateSchema, toolInputSchemas,
  type PlanChangeEstimate, type ToolEnvelope, type ToolName,
} from "@/lib/contracts";
import { createQuote } from "@/lib/session/quotes";
import { registerDataRef, type DemoSession } from "@/lib/session/store";
import { callInternalTool } from "./internal-client";

export type ExecutedTool = ToolEnvelope<unknown> & { data_ref: string | null };

type Deps = Parameters<typeof callInternalTool>[3];

const INTERNAL_ERROR: ToolEnvelope<never> = {
  status: "error", data: null,
  error: { code: "INTERNAL_ERROR", message: "目前系統無法完成這項操作，請稍後再試。" },
};

/** FastAPI 只給資格與價差；合格時由 Next.js 建立 Quote 並組成完整的模型可見 PlanChangeEstimate。 */
function withQuote(session: DemoSession, raw: unknown): ToolEnvelope<PlanChangeEstimate> {
  const parsed = PlanChangeEstimateSchema.safeParse(raw);
  const subscriptionId = (raw as { subscription_id?: unknown } | null)?.subscription_id;
  if (!parsed.success || typeof subscriptionId !== "string") return INTERNAL_ERROR;
  const estimate: PlanChangeEstimate = { ...parsed.data, quote_id: null, expires_at: null };
  if (estimate.eligible) {
    const quote = createQuote(session, estimate, subscriptionId);
    estimate.quote_id = quote.quote_id;
    estimate.expires_at = quote.expires_at;
  }
  return { status: "success", data: estimate, error: null };
}

/**
 * 八個業務工具的 Next.js 端執行入口（目前實作 get_my_subscription、get_my_bill）。
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
  // 模型直接呼叫寫入工具永遠沒有授權：只有 PlanChangeCard 的 confirm Action 才可能寫入（SPEC §5.5）。
  if (name === "create_plan_change_request") {
    return {
      status: "error", data: null, data_ref: null,
      error: {
        code: "CONFIRMATION_REQUIRED",
        message: "請先查看方案變更確認卡片，並點擊『確認送出』才會建立待審申請。",
      },
    };
  }
  let envelope = await callInternalTool(name, parsed.data, session.customerId, deps);
  // 只讀工具可重試一次（SPEC §10.1）
  if (envelope.status === "error" && envelope.error.code === "INTERNAL_ERROR") {
    envelope = await callInternalTool(name, parsed.data, session.customerId, deps);
  }
  if (name === "estimate_plan_change" && envelope.status === "success") {
    envelope = withQuote(session, envelope.data);
  }
  const data_ref = envelope.status === "success" ? registerDataRef(session, name, envelope) : null;
  return { ...envelope, data_ref };
}
