"use client";

import { useEffect, useState } from "react";
import { SearchPolicyResultSchema, type PolicyMatch } from "@/lib/contracts";

type State = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; matches: PolicyMatch[] };

/** 條款內容一律來自伺服器 Session 內實際檢索過的結果；source_refs 查不到的來源不顯示。 */
export function PolicyReference({ source_refs }: { source_refs: string[] }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const key = source_refs.join(",");

  useEffect(() => {
    let alive = true;
    fetch(`/api/policy-refs?refs=${encodeURIComponent(key)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const body = await res.json();
        const parsed = SearchPolicyResultSchema.safeParse(body?.data);
        if (!alive) return;
        setState(
          res.ok && body?.status === "success" && parsed.success && parsed.data.matches.length > 0
            ? { kind: "ready", matches: parsed.data.matches }
            : { kind: "invalid" },
        );
      })
      .catch(() => alive && setState({ kind: "invalid" }));
    return () => {
      alive = false;
    };
  }, [key]);

  if (state.kind === "loading") return <div className="card" aria-busy="true">載入政策來源中…</div>;
  if (state.kind === "invalid") return <div className="card card-invalid" role="alert">查無可引用的政策來源。</div>;
  return (
    <section className="card" data-testid="policy-reference" aria-label="政策來源">
      <header><h3>政策依據</h3></header>
      <ul>
        {state.matches.map((m) => (
          <li key={`${m.document_id}#${m.section_id}`}>
            <strong>{m.title}／{m.section_title}</strong>
            <p>{m.content}</p>
            <footer>
              來源：{m.document_id}#{m.section_id}（{m.source_path}）
            </footer>
          </li>
        ))}
      </ul>
    </section>
  );
}
