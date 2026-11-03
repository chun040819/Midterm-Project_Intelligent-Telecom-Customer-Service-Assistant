"use client";

import { chartRows, selectPlans, type ChartMetric } from "@/lib/plan-view";
import { usePlansRef } from "./usePlansRef";

const LABEL: Record<ChartMetric, { title: string; unit: string }> = {
  monthly_fee: { title: "月租費比較", unit: "元" },
  data_limit_gb: { title: "高速流量比較", unit: "GB" },
};

export function PlanChart({ data_ref, metric, selected_plan_ids }: { data_ref: string; metric: ChartMetric; selected_plan_ids?: string[] }) {
  const state = usePlansRef(data_ref);
  if (state.kind === "loading") return <div className="card" aria-busy="true">載入圖表資料中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">資料已失效，請重新查詢。</div>;
  const rows = chartRows(selectPlans(state.data, selected_plan_ids), metric);
  if (rows.length === 0) return <div className="card" data-testid="plan-chart-empty">沒有符合條件的有效方案。</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const { title, unit } = LABEL[metric];
  return (
    <section className="card" data-testid="plan-chart" data-metric={metric} aria-label={title}>
      <h3>{title}</h3>
      {rows.map((r) => (
        <div key={r.plan_id} className="bar-row" data-plan-id={r.plan_id} style={{ display: "grid", gridTemplateColumns: "64px 1fr 80px", gap: 8, alignItems: "center", margin: "6px 0" }}>
          <span>{r.plan_id}</span>
          <div style={{ background: "var(--line)", borderRadius: 4 }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: 14, background: "var(--brand)", borderRadius: 4 }} />
          </div>
          <span>{r.value} {unit}</span>
        </div>
      ))}
    </section>
  );
}
