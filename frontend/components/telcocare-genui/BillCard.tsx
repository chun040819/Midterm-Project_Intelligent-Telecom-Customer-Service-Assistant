"use client";

import { useEffect, useState } from "react";
import { BillResultSchema, type BillResult } from "@/lib/contracts";

type State = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; data: BillResult };

const STATUS_LABEL: Record<BillResult["payment_status"], string> = {
  PAID: "已繳費",
  UNPAID: "未繳費",
  OVERDUE: "已逾期",
};

/** 業務數字一律來自伺服器 Session 內的 data_ref；解析不到就不顯示任何數字。 */
export function BillCard({ data_ref }: { data_ref: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch(`/api/data-ref/${encodeURIComponent(data_ref)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json();
        const parsed = BillResultSchema.safeParse(body?.data);
        if (!alive) return;
        setState(res.ok && body?.status === "success" && parsed.success ? { kind: "ready", data: parsed.data } : { kind: "invalid" });
      })
      .catch(() => alive && setState({ kind: "invalid" }));
    return () => {
      alive = false;
    };
  }, [data_ref]);

  if (state.kind === "loading") return <div className="card" aria-busy="true">載入帳單資料中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">資料已失效，請重新查詢。</div>;
  const { billing_month, amount, due_date, payment_status, bill_id } = state.data;
  return (
    <section className="card" data-testid="bill-card" aria-label="月份帳單">
      <header>
        <span className="badge">{STATUS_LABEL[payment_status]}</span>
        <h3>{billing_month} 帳單</h3>
      </header>
      <dl>
        <div><dt>帳單金額</dt><dd>{amount} 元</dd></div>
        <div><dt>繳費期限</dt><dd>{due_date}</dd></div>
        <div><dt>繳費狀態</dt><dd data-status={payment_status}>{payment_status}（{STATUS_LABEL[payment_status]}）</dd></div>
      </dl>
      <footer>帳單編號 {bill_id}</footer>
    </section>
  );
}
