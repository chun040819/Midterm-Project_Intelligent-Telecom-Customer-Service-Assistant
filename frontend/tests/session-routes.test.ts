import { beforeEach, describe, expect, it } from "vitest";
import { getDataRef, getDemoAccount } from "@/lib/server/handlers";
import { clearAllSessions, registerDataRef } from "@/lib/session/store";
import { sessionFromRequest } from "@/lib/session/http";

beforeEach(() => clearAllSessions());

function cookieOf(res: Response) {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

describe("demo account / session cookie", () => {
  it("新訪客預設 C0001，Cookie 為 HttpOnly + SameSite", async () => {
    const res = getDemoAccount(new Request("http://x/api/demo/account"));
    expect(await res.json()).toEqual({ customer_id: "C0001", display_name: "Demo 客戶 A" });
    const raw = res.headers.get("set-cookie")!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it("帶有效 Cookie 時沿用同一 session，不再發新 Cookie", () => {
    const first = getDemoAccount(new Request("http://x/"));
    const res = getDemoAccount(new Request("http://x/", { headers: { cookie: cookieOf(first) } }));
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("偽造的 session id 不被採用", () => {
    expect(sessionFromRequest(new Request("http://x/", { headers: { cookie: "telcocare_session=forged" } }))).toBeUndefined();
  });
});

describe("data_ref 解析", () => {
  it("擁有者可取得伺服器快取的 Envelope", async () => {
    const first = getDemoAccount(new Request("http://x/"));
    const cookie = cookieOf(first);
    const session = sessionFromRequest(new Request("http://x/", { headers: { cookie } }))!;
    const envelope = { status: "success", data: { n: 1 }, error: null } as const;
    const ref = registerDataRef(session, "get_my_subscription", envelope);
    const res = getDataRef(new Request("http://x/", { headers: { cookie } }), ref);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(envelope);
  });

  it("其他 session 或無 Cookie 取得 404 且不含資料", async () => {
    const owner = getDemoAccount(new Request("http://x/"));
    const ownerSession = sessionFromRequest(new Request("http://x/", { headers: { cookie: cookieOf(owner) } }))!;
    const ref = registerDataRef(ownerSession, "t", { status: "success", data: { secret: 1 }, error: null });
    const other = cookieOf(getDemoAccount(new Request("http://x/")));
    for (const headers of [{ cookie: other }, {} as Record<string, string>]) {
      const res = getDataRef(new Request("http://x/", { headers }), ref);
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain("secret");
    }
  });
});
