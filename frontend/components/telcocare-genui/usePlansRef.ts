"use client";

import { useEffect, useState } from "react";
import type { PlansResult } from "@/lib/contracts";
import { parsePlansEnvelope } from "@/lib/plan-view";

export type PlansState = { kind: "loading" } | { kind: "invalid" } | { kind: "ready"; data: PlansResult };

/** 以 data_ref 向伺服器解析可信方案資料；解析不到就是 invalid，不顯示任何數字。 */
export function usePlansRef(data_ref: string): PlansState {
  const [state, setState] = useState<PlansState>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    fetch(`/api/data-ref/${encodeURIComponent(data_ref)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const data = parsePlansEnvelope(await res.json(), res.ok);
        if (alive) setState(data ? { kind: "ready", data } : { kind: "invalid" });
      })
      .catch(() => alive && setState({ kind: "invalid" }));
    return () => {
      alive = false;
    };
  }, [data_ref]);
  return state;
}
