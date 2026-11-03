import { PlansResultSchema, type PlansResult } from "@/lib/contracts";

type Plan = PlansResult["plans"][number];

export type ChartMetric = "monthly_fee" | "data_limit_gb";

/** 解析 /api/data-ref 回應；失效、錯誤或不合 schema 一律回 null（呼叫端不顯示任何數字）。 */
export function parsePlansEnvelope(body: unknown, httpOk: boolean): PlansResult | null {
  const b = body as { status?: string; data?: unknown } | null;
  if (!httpOk || b?.status !== "success") return null;
  const parsed = PlansResultSchema.safeParse(b.data);
  return parsed.success ? parsed.data : null;
}

/** 模型選定的方案只能是可信結果的子集；不存在的 id 被忽略，不會新增方案。 */
export function selectPlans(trusted: PlansResult, selectedIds: string[] | undefined): Plan[] {
  if (!selectedIds) return trusted.plans;
  const wanted = new Set(selectedIds);
  return trusted.plans.filter((p) => wanted.has(p.plan_id));
}

/** ISO 8601 → 「YYYY/MM/DD HH:mm」本地時間（timeZone 省略時用瀏覽器時區）；無法解析則原樣回傳。 */
export function formatExpiry(iso: string, timeZone?: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(ms).map((p) => [p.type, p.value]),
  );
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function chartRows(plans: Plan[], metric: ChartMetric) {
  return plans.map((p) => ({ plan_id: p.plan_id, name: p.name, value: p[metric] }));
}
