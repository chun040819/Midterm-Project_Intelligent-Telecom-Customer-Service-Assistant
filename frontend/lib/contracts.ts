import { z } from "zod";

export type BusinessErrorCode =
  | "NOT_FOUND" | "FORBIDDEN" | "VALIDATION_ERROR" | "CONFLICT"
  | "CONFIRMATION_REQUIRED" | "QUOTE_EXPIRED" | "INSUFFICIENT_EVIDENCE" | "INTERNAL_ERROR";

export type ToolEnvelope<T> =
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: { code: BusinessErrorCode; message: string } };

export const PlanSchema = z.object({
  plan_id: z.string(),
  name: z.string(),
  monthly_fee: z.number().int().nonnegative(),
  data_limit_gb: z.number().nonnegative(),
  voice_minutes: z.number().int().nonnegative(),
  is_active: z.boolean(),
});

export const SubscriptionResultSchema = z.object({
  subscription_id: z.string(),
  plan: PlanSchema,
  contract_end_date: z.string(),
});

export type SubscriptionResult = z.infer<typeof SubscriptionResultSchema>;

// 模型可見的工具 Input（SPEC §5.3）。strict() 對應 additionalProperties:false。
export const toolInputSchemas = {
  get_my_subscription: z.object({}).strict(),
} as const;

export type ToolName = keyof typeof toolInputSchemas;
