"use client";

import { useEffect, useState } from "react";
import { UsageResultSchema, type UsageResult } from "@/lib/contracts";

type State = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; data: UsageResult };

/** 業務數字一律來自伺服器 Session 內的 data_ref；解析不到就不顯示任何數字。 */
export function UsageCard({ data_ref }: { data_ref: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/data-ref/${encodeURIComponent(data_ref)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json();
        const parsed = UsageResultSchema.safeParse(body?.data);
        if (!alive) return;
        setState(res.ok && body?.status === "success" && parsed.success ? { kind: "ready", data: parsed.data } : { kind: "invalid" });
      })
      .catch(() => alive && setState({ kind: "invalid" }));
    return () => {
      alive = false;
    };
  }, [data_ref]);

  if (state.kind === "loading") return <div className="card" aria-busy="true">載入用量資料中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">資料已失效，請重新查詢。</div>;
  const { month, data_limit_gb, data_used_gb, remaining_data_gb, exceeded_data_gb, voice_used_minutes } = state.data;
  const percent = data_limit_gb > 0 ? Math.min(100, Math.round((data_used_gb / data_limit_gb) * 100)) : 0;
  const exceeded = exceeded_data_gb > 0;
  return (
    <section className="card" data-testid="usage-card" aria-label="月份流量用量">
      <header>
        {exceeded && <span className="badge">已超額</span>}
        <h3>{month} 流量用量</h3>
      </header>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`高速流量已使用 ${percent}%`}
        style={{ background: "#e5e7eb", borderRadius: 4, height: 8, overflow: "hidden" }}
      >
        <div style={{ width: `${percent}%`, height: "100%", background: exceeded ? "#dc2626" : "#2563eb" }} />
      </div>
      <dl>
        <div><dt>高速流量額度</dt><dd>{data_limit_gb} GB</dd></div>
        <div><dt>已使用</dt><dd>{data_used_gb} GB</dd></div>
        <div><dt>剩餘</dt><dd>{remaining_data_gb} GB</dd></div>
        <div><dt>超額</dt><dd>{exceeded_data_gb} GB</dd></div>
        <div><dt>語音通話</dt><dd>{voice_used_minutes} 分鐘</dd></div>
      </dl>
    </section>
  );
}
