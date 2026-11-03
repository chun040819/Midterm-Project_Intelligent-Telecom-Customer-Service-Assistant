"use client";

import { useEffect, useState } from "react";
import { DEMO_CUSTOMERS } from "@/lib/session/demo-customers";
import { Provider } from "./Provider";
import { Thread } from "./Thread";

type Account = { customer_id: string };

export function DemoApp() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  // 換客戶時遞增，讓 Provider／Thread 整個重掛，聊天與前端 refs 隨之清空。
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/demo/account", { cache: "no-store" })
      .then((r) => r.json() as Promise<Account>)
      .then((a) => setCustomerId(a.customer_id))
      .catch(() => setError("無法取得目前 Demo 客戶。"));
  }, []);

  async function choose(next: string) {
    setError(null);
    try {
      const res = await fetch("/api/demo/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: next }),
      });
      if (!res.ok) throw new Error();
      const a = (await res.json()) as Account;
      setCustomerId(a.customer_id);
      setEpoch((n) => n + 1);
    } catch {
      setError("切換客戶失敗，請重試。");
    }
  }

  return (
    <main className="page">
      <header className="top">
        <h1>TelcoCare AI</h1>
        <label className="who">
          Demo 客戶：
          <select
            aria-label="Demo 客戶"
            value={customerId ?? ""}
            disabled={customerId === null}
            onChange={(e) => choose(e.target.value)}
          >
            {customerId === null && <option value="">載入中…</option>}
            {Object.entries(DEMO_CUSTOMERS).map(([id, name]) => (
              <option key={id} value={id}>{`${name}（${id}）`}</option>
            ))}
          </select>
          <span> · 虛構資料</span>
        </label>
      </header>
      {error && <p role="alert" className="card-invalid">{error}</p>}
      <Provider key={epoch}>
        <Thread />
      </Provider>
    </main>
  );
}
