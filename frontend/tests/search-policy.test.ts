import { beforeEach, describe, expect, it } from "vitest";
import { getDemoAccount, getPolicyRefs } from "@/lib/server/handlers";
import { executeReadTool } from "@/lib/server/tool-executor";
import { clearAllSessions, createSession, registerDataRef, resolveDataRef } from "@/lib/session/store";
import { sessionFromRequest } from "@/lib/session/http";

beforeEach(() => clearAllSessions());

const match = {
  document_id: "plan_change_policy", title: "方案變更政策", section_id: "downgrade_rules",
  section_title: "降級申請條件", content: "在合約到期日之前，不得提出降級申請。", source_path: "knowledge/plan_change_policy.md",
};
const policy = { status: "success", data: { matches: [match] }, error: null };

function fakeFetch(respond: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  };
  return { fetch, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("executeReadTool(search_policy)", () => {
  it("轉送 query 並回傳 data_ref", async () => {
    const session = createSession();
    const { fetch, calls } = fakeFetch(() => json(policy));
    const result = await executeReadTool(session, "search_policy", { query: "合約未到期可以降級嗎？" }, { fetch, baseUrl: "http://internal", token: "tok" });
    expect(calls[0].url).toBe("http://internal/internal/tools/search_policy");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ arguments: { query: "合約未到期可以降級嗎？" } });
    expect(result.status).toBe("success");
    expect(resolveDataRef(session, result.data_ref!)?.envelope).toEqual(policy);
  });

  it.each([{}, { query: "" }, { query: "x".repeat(501) }, { query: "a", top_k: 9 }, { query: 5 }])(
    "無效輸入 %j 被拒且不發出請求",
    async (args) => {
      const session = createSession();
      const { fetch, calls } = fakeFetch(() => json(policy));
      const result = await executeReadTool(session, "search_policy", args, { fetch });
      expect(calls).toHaveLength(0);
      expect(result).toMatchObject({ status: "error", data_ref: null, error: { code: "VALIDATION_ERROR" } });
    },
  );

  it("INSUFFICIENT_EVIDENCE 原樣回傳且不產生 data_ref", async () => {
    const session = createSession();
    const body = { status: "error", data: null, error: { code: "INSUFFICIENT_EVIDENCE", message: "無依據" } };
    const { fetch } = fakeFetch(() => json(body, 422));
    const result = await executeReadTool(session, "search_policy", { query: "8 折" }, { fetch });
    expect(result).toMatchObject({ status: "error", data_ref: null, error: { code: "INSUFFICIENT_EVIDENCE" } });
  });
});

describe("getPolicyRefs（PolicyReference 的來源解析）", () => {
  function newCookie() {
    return (getDemoAccount(new Request("http://x/")).headers.get("set-cookie") ?? "").split(";")[0];
  }
  function withSearch() {
    const cookie = newCookie();
    const session = sessionFromRequest(new Request("http://x/", { headers: { cookie } }))!;
    registerDataRef(session, "search_policy", policy as never);
    return cookie;
  }
  const get = (cookie: string | null, refs: string) =>
    getPolicyRefs(new Request(`http://x/api/policy-refs?refs=${encodeURIComponent(refs)}`, { headers: cookie ? { cookie } : {} }));

  it("只回傳本 Session 檢索過的來源", async () => {
    const res = get(withSearch(), "plan_change_policy#downgrade_rules");
    expect(res.status).toBe(200);
    expect((await res.json()).data.matches).toEqual([match]);
  });

  it("未檢索過或不存在的來源不回傳（不捏造引用）", async () => {
    const cookie = withSearch();
    const res = get(cookie, "plan_change_policy#downgrade_rules,billing_policy#monthly_fee,fake#none");
    expect((await res.json()).data.matches).toEqual([match]);
    expect((await get(cookie, "fake#none").json()).data.matches).toEqual([]);
  });

  it("其他 session 看不到別人的檢索結果；無 Cookie 得 404；格式不合法得 422", async () => {
    const cookie = withSearch();
    const other = get(newCookie(), "plan_change_policy#downgrade_rules");
    expect((await other.json()).data.matches).toEqual([]);
    expect(get(null, "plan_change_policy#downgrade_rules").status).toBe(404);
    expect(get(cookie, "../../etc/passwd").status).toBe(422);
  });
});
