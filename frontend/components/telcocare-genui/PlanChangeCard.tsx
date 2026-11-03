"use client";

import { useEffect, useState } from "react";
import {
  PlanChangeCreatedSchema, PlanChangeEstimateSchema, PlanChangeStatusSchema,
  type PlanChangeCreated, type PlanChangeEstimate, type PlanChangeStatus,
} from "@/lib/contracts";
import { formatExpiry } from "@/lib/plan-view";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "ready"; data: PlanChangeEstimate; busy: boolean; message?: string }
  | { kind: "success"; data: PlanChangeEstimate; request: { request_id: string; already_existed: boolean } }
  | { kind: "cancelled" };

const POLICY_TITLE: Record<string, string> = {
  "plan_change_policy#upgrade_rules": "升級申請條件",
  "plan_change_policy#downgrade_rules": "降級申請條件",
  "plan_change_policy#pending_rule": "待審核申請限制",
  "plan_change_policy#review_rule": "確認與審核流程",
};

const STATUS_LABEL: Record<PlanChangeStatus["status"], string> = {
  PENDING: "待審核",
  APPROVED: "已核准",
  REJECTED: "已拒絕",
};

type StatusState = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; data: PlanChangeStatus };

/** 申請狀態一律來自伺服器 Session 內的可信 request_ref（get_plan_change_status 的 data_ref）；唯讀、無任何操作。 */
function RequestStatusCard({ request_ref }: { request_ref: string }) {
  const [state, setState] = useState<StatusState>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/data-ref/${encodeURIComponent(request_ref)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json();
        const parsed = PlanChangeStatusSchema.safeParse(body?.data);
        if (!alive) return;
        setState(res.ok && body?.status === "success" && parsed.success ? { kind: "ready", data: parsed.data } : { kind: "invalid" });
      })
      .catch(() => alive && setState({ kind: "invalid" }));
    return () => {
      alive = false;
    };
  }, [request_ref]);

  if (state.kind === "loading") return <div className="card" aria-busy="true">載入申請狀態中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">資料已失效，請重新查詢。</div>;
  const d = state.data;
  return (
    <section className="card" data-testid="plan-change-status" aria-label="方案變更申請狀態">
      <header>
        <span className="badge" data-status={d.status}>{STATUS_LABEL[d.status]}</span>
        <h3>{d.old_plan_id} → {d.new_plan_id}</h3>
      </header>
      <dl>
        <div><dt>申請編號</dt><dd data-testid="request-id">{d.request_id}</dd></div>
        <div><dt>申請狀態</dt><dd>{d.status}（{STATUS_LABEL[d.status]}）</dd></div>
        <div><dt>建立時間</dt><dd>{d.created_at}</dd></div>
      </dl>
      {d.status === "PENDING" && <p className="muted">申請尚在審核中，審核通過前不會變更您目前的訂閱方案。</p>}
    </section>
  );
}

/** quote_ref 與 request_ref 恰好擇一；兩者皆無或皆有就視為失效，不顯示任何資料。 */
export function PlanChangeCard({ quote_ref, request_ref }: { quote_ref?: string; request_ref?: string }) {
  if (request_ref && !quote_ref) return <RequestStatusCard request_ref={request_ref} />;
  if (quote_ref && !request_ref) return <QuoteCard quote_ref={quote_ref} />;
  return <div className="card card-invalid" role="alert">此卡片資料無效，請重新查詢。</div>;
}

/** 數字一律來自伺服器 Session 內的 Quote（quote_ref）；失效就不顯示任何數字或按鈕。 */
function QuoteCard({ quote_ref }: { quote_ref: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/plan-change/quote/${encodeURIComponent(quote_ref)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json();
        const parsed = PlanChangeEstimateSchema.safeParse(body?.data);
        if (!alive) return;
        if (!(res.ok && body?.status === "success" && parsed.success)) return setState({ kind: "invalid" });
        // 已確認過的 Quote（重新掛載）直接顯示成功，不再提供按鈕。
        const requestId = body.data?.request_id;
        setState(
          typeof requestId === "string" && requestId
            ? { kind: "success", data: parsed.data, request: { request_id: requestId, already_existed: true } }
            : { kind: "ready", data: parsed.data, busy: false },
        );
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
      const created = PlanChangeCreatedSchema.safeParse(body?.data);
      if (path === "confirm" && res.ok && body?.status === "success" && created.success) {
        const c: PlanChangeCreated = created.data;
        return setState({ kind: "success", data, request: { request_id: c.request_id, already_existed: c.already_existed } });
      }
      // 其餘一律如實顯示錯誤，不宣稱成功。
      setState({ kind: "ready", data, busy: false, message: body?.error?.message ?? "目前系統無法完成這項操作，請稍後再試。" });
    } catch {
      setState({ kind: "ready", data, busy: false, message: "目前系統無法完成這項操作，請稍後再試。" });
    }
  }

  if (state.kind === "loading") return <div className="card" aria-busy="true">載入方案變更評估中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">此評估已失效，請重新查詢並確認。</div>;
  if (state.kind === "cancelled") return <div className="card" data-testid="plan-change-cancelled">已取消此次方案變更評估，未建立任何申請。</div>;
  if (state.kind === "success") {
    return (
      <section className="card" data-testid="plan-change-success" aria-label="方案變更申請結果">
        <header>
          <span className="badge">待審核</span>
          <h3>{state.data.current_plan_id} → {state.data.new_plan_id}</h3>
        </header>
        <p>
          {state.request.already_existed ? "此申請先前已送出，未重複建立。" : "已送出申請。"}
          申請編號 <strong data-testid="request-id">{state.request.request_id}</strong>，狀態為待審核（PENDING）。
        </p>
        <p className="muted">審核通過前不會變更您目前的訂閱方案。</p>
      </section>
    );
  }
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
        <button type="button" disabled={state.busy} onClick={() => act("confirm")}>{state.busy ? "送出中…" : "確認送出"}</button>
        <button type="button" disabled={state.busy} onClick={() => act("cancel")}>取消</button>
      </div>
      <footer>評估有效至 {d.expires_at ? formatExpiry(d.expires_at) : "—"}</footer>
    </section>
  );
}
