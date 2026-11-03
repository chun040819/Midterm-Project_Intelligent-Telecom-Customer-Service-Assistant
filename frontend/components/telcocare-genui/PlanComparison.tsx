"use client";

import { selectPlans } from "@/lib/plan-view";
import { usePlansRef } from "./usePlansRef";

export function PlanComparison({ data_ref, selected_plan_ids }: { data_ref: string; selected_plan_ids?: string[] }) {
  const state = usePlansRef(data_ref);
  if (state.kind === "loading") return <div className="card" aria-busy="true">載入資費資料中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">資料已失效，請重新查詢。</div>;
  const plans = selectPlans(state.data, selected_plan_ids);
  if (plans.length === 0) return <div className="card" data-testid="plan-comparison-empty">沒有符合條件的有效方案。</div>;
  return (
    <section className="card" data-testid="plan-comparison" aria-label="資費比較">
      <table>
        <thead>
          <tr><th>方案</th><th>月租費</th><th>高速流量</th><th>通話分鐘</th></tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.plan_id} data-plan-id={p.plan_id}>
              <td>{p.plan_id} {p.name}</td>
              <td>{p.monthly_fee} 元</td>
              <td>{p.data_limit_gb} GB</td>
              <td>{p.voice_minutes} 分鐘</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
