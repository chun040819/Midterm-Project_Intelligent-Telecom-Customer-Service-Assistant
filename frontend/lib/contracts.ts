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

export const MonthSchema = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);

export const BillResultSchema = z.object({
  bill_id: z.string(),
  billing_month: MonthSchema,
  amount: z.number().int().nonnegative(),
  due_date: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
  payment_status: z.enum(["PAID", "UNPAID", "OVERDUE"]),
});

export type BillResult = z.infer<typeof BillResultSchema>;

export const PolicyMatchSchema = z.object({
  document_id: z.string(),
  title: z.string(),
  section_id: z.string(),
  section_title: z.string(),
  content: z.string(),
  source_path: z.string(),
});

export const SearchPolicyResultSchema = z.object({ matches: z.array(PolicyMatchSchema) });

export type PolicyMatch = z.infer<typeof PolicyMatchSchema>;
export type SearchPolicyResult = z.infer<typeof SearchPolicyResultSchema>;

/** `document_id#section_id`；僅允許小寫英數與底線，不接受路徑、URL。 */
export const SourceRefSchema = z.string().regex(/^[a-z0-9_]+#[a-z0-9_]+$/);
export const PlansResultSchema = z.object({ plans: z.array(PlanSchema) });

export type PlansResult = z.infer<typeof PlansResultSchema>;

export const UsageResultSchema = z.object({
  month: MonthSchema,
  data_limit_gb: z.number().nonnegative(),
  data_used_gb: z.number().nonnegative(),
  remaining_data_gb: z.number().nonnegative(),
  exceeded_data_gb: z.number().nonnegative(),
  voice_used_minutes: z.number().int().nonnegative(),
});

export type UsageResult = z.infer<typeof UsageResultSchema>;

/** 模型可見的完整 PlanChangeEstimate（SPEC §5.2）；quote_id／expires_at 由 Next.js 填入。 */
export const PlanChangeEstimateSchema = z.object({
  eligible: z.boolean(),
  reason_code: z.string().nullable(),
  current_plan_id: z.string(),
  new_plan_id: z.string(),
  current_monthly_fee: z.number().int().nonnegative(),
  new_monthly_fee: z.number().int().nonnegative(),
  monthly_delta: z.number().int(),
  quote_id: z.string().nullable(),
  expires_at: z.string().nullable(),
  policy_refs: z.array(z.string()),
});

export type PlanChangeEstimate = z.infer<typeof PlanChangeEstimateSchema>;

export const PlanChangeCreatedSchema = z.object({
  request_id: z.string().min(1),
  quote_id: z.string(),
  old_plan_id: z.string(),
  new_plan_id: z.string(),
  status: z.literal("PENDING"),
  created_at: z.string(),
  already_existed: z.boolean(),
});

export type PlanChangeCreated = z.infer<typeof PlanChangeCreatedSchema>;

// 模型可見的工具 Input（SPEC §5.3）。strict() 對應 additionalProperties:false。
export const toolInputSchemas = {
  get_my_subscription: z.object({}).strict(),
  get_my_bill: z.object({ billing_month: MonthSchema.optional() }).strict(),
  search_policy: z.object({ query: z.string().min(1).max(500) }).strict(),
  list_plans: z.object({ max_monthly_fee: z.number().int().nonnegative().optional() }).strict(),
  get_my_usage: z.object({ month: MonthSchema.optional() }).strict(),
  estimate_plan_change: z.object({ new_plan_id: z.string().regex(/^P[0-9]{3}$/) }).strict(),
  create_plan_change_request: z.object({ quote_id: z.string().min(1).max(100) }).strict(),
} as const;

export type ToolName = keyof typeof toolInputSchemas;
