"use client";

import { useEffect, useState } from "react";
import { SubscriptionResultSchema, type SubscriptionResult } from "@/lib/contracts";

type State = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; data: SubscriptionResult };

/** 業務數字一律來自伺服器 Session 內的 data_ref；解析不到就不顯示任何數字。 */
export function SubscriptionCard({ data_ref }: { data_ref: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/data-ref/${encodeURIComponent(data_ref)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json();
        const parsed = SubscriptionResultSchema.safeParse(body?.data);
        if (!alive) return;
        setState(res.ok && body?.status === "success" && parsed.success ? { kind: "ready", data: parsed.data } : { kind: "invalid" });
      })
      .catch(() => alive && setState({ kind: "invalid" }));
    return () => {
      alive = false;
    };
  }, [data_ref]);

  if (state.kind === "loading") return <div className="card" aria-busy="true">載入方案資料中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">資料已失效，請重新查詢。</div>;
  const { plan, contract_end_date, subscription_id } = state.data;
  return (
    <section className="card" data-testid="subscription-card" aria-label="目前訂閱">
      <header>
        <span className="badge">{plan.plan_id}</span>
        <h3>{plan.name}</h3>
      </header>
      <dl>
        <div><dt>月租費</dt><dd>{plan.monthly_fee} 元</dd></div>
        <div><dt>高速流量</dt><dd>{plan.data_limit_gb} GB</dd></div>
        <div><dt>通話分鐘</dt><dd>{plan.voice_minutes} 分鐘</dd></div>
        <div><dt>合約到期日</dt><dd>{contract_end_date}</dd></div>
      </dl>
      <footer>訂閱編號 {subscription_id}</footer>
    </section>
  );
}
