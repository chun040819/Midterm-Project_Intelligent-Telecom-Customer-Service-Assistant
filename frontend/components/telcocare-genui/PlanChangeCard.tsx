"use client";

import { useEffect, useState } from "react";
import { PlanChangeEstimateSchema, type PlanChangeEstimate } from "@/lib/contracts";
import { formatExpiry } from "@/lib/plan-view";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "ready"; data: PlanChangeEstimate; busy: boolean; message?: string }
  | { kind: "cancelled" };

const POLICY_TITLE: Record<string, string> = {
  "plan_change_policy#upgrade_rules": "升級申請條件",
  "plan_change_policy#downgrade_rules": "降級申請條件",
  "plan_change_policy#pending_rule": "待審核申請限制",
  "plan_change_policy#review_rule": "確認與審核流程",
};

/** 數字一律來自伺服器 Session 內的 Quote（quote_ref）；失效就不顯示任何數字或按鈕。 */
export function PlanChangeCard({ quote_ref }: { quote_ref: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/plan-change/quote/${encodeURIComponent(quote_ref)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json();
        const parsed = PlanChangeEstimateSchema.safeParse(body?.data);
        if (!alive) return;
        setState(res.ok && body?.status === "success" && parsed.success ? { kind: "ready", data: parsed.data, busy: false } : { kind: "invalid" });
      })
      .catch(() => alive && setState({ kind: "invalid" }));
    return () => {
      alive = false;
    };
  }, [quote_ref]);

  async function act(path: "confirm" | "cancel") {
    if (state.kind !== "ready" || state.busy) return;
    const data = state.data;
    setState({ kind: "ready", data, busy: true });
    try {
      const res = await fetch(`/api/plan-change/${path}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_id: quote_ref }),
      });
      const body = await res.json().catch(() => null);
      if (path === "cancel" && res.ok && body?.status === "success") return setState({ kind: "cancelled" });
      if (res.status === 404 || body?.error?.code === "QUOTE_EXPIRED") return setState({ kind: "invalid" });
      // 寫入功能完成前，confirm 只會得到錯誤；如實顯示，不宣稱成功。
      setState({ kind: "ready", data, busy: false, message: body?.error?.message ?? "目前系統無法完成這項操作，請稍後再試。" });
    } catch {
      setState({ kind: "ready", data, busy: false, message: "目前系統無法完成這項操作，請稍後再試。" });
    }
  }

  if (state.kind === "loading") return <div className="card" aria-busy="true">載入方案變更評估中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">此評估已失效，請重新查詢並確認。</div>;
  if (state.kind === "cancelled") return <div className="card" data-testid="plan-change-cancelled">已取消此次方案變更評估，未建立任何申請。</div>;
  const d = state.data;
  const sign = d.monthly_delta > 0 ? "+" : "";
  return (
    <section className="card" data-testid="plan-change-card" aria-label="方案變更確認">
      <header>
        <span className="badge">待確認</span>
        <h3>{d.current_plan_id} → {d.new_plan_id}</h3>
      </header>
      <dl>
        <div><dt>目前月租</dt><dd>{d.current_monthly_fee} 元</dd></div>
        <div><dt>新月租</dt><dd>{d.new_monthly_fee} 元</dd></div>
        <div><dt>每月差額</dt><dd data-testid="monthly-delta">{sign}{d.monthly_delta} 元</dd></div>
      </dl>
      <p>確認後只會新增一筆待審（PENDING）申請，不會立即生效；是否核准由後續審核決定。</p>
      {d.policy_refs.length > 0 && (
        <p className="muted">政策依據：{d.policy_refs.map((r) => POLICY_TITLE[r] ?? r).join("、")}</p>
      )}
      {state.message && <p role="alert" className="card-invalid">{state.message}</p>}
      <div className="actions">
        <button type="button" disabled={state.busy} onClick={() => act("confirm")}>確認送出</button>
        <button type="button" disabled={state.busy} onClick={() => act("cancel")}>取消</button>
      </div>
      <footer>評估有效至 {d.expires_at ? formatExpiry(d.expires_at) : "—"}</footer>
    </section>
  );
}
