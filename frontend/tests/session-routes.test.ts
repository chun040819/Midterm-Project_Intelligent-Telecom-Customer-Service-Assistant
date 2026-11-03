import { beforeEach, describe, expect, it } from "vitest";
import { getDataRef, getDemoAccount, setDemoAccount } from "@/lib/server/handlers";
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

const ORIGIN = "http://127.0.0.1:3000";
function postAccount(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/demo/account`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}
async function newSession() {
  const res = getDemoAccount(new Request(`${ORIGIN}/api/demo/account`));
  const cookie = cookieOf(res);
  return { cookie, session: sessionFromRequest(new Request(ORIGIN, { headers: { cookie } }))! };
}

describe("POST /api/demo/account 切換客戶", () => {
  it("五個 Seed 客戶都可切換並回傳對應顯示名稱", async () => {
    const { cookie } = await newSession();
    for (const [id, name] of [["C0002", "Demo 客戶 B"], ["C0005", "Demo 客戶 E"], ["C0001", "Demo 客戶 A"]]) {
      const res = await setDemoAccount(postAccount({ customer_id: id }, { cookie }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ customer_id: id, display_name: name });
      const again = getDemoAccount(new Request(ORIGIN, { headers: { cookie } }));
      expect((await again.json()).customer_id).toBe(id);
    }
  });

  it("非 Seed 客戶、缺欄位、多餘欄位、壞 JSON 皆 422 且不改變客戶", async () => {
    const { cookie, session } = await newSession();
    for (const body of [{ customer_id: "C9999" }, {}, { customer_id: 1 }, { customer_id: "C0002", x: 1 }]) {
      const res = await setDemoAccount(postAccount(body, { cookie }));
      expect(res.status).toBe(422);
      expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    }
    const bad = new Request(`${ORIGIN}/api/demo/account`, { method: "POST", headers: { origin: ORIGIN, cookie }, body: "{" });
    expect((await setDemoAccount(bad)).status).toBe(422);
    expect(session.customerId).toBe("C0001");
  });

  it("切換後清除工具快取，舊 data_ref 不能再解析（E03）", async () => {
    const { cookie, session } = await newSession();
    const ref = registerDataRef(session, "get_my_subscription", { status: "success", data: { n: 1 }, error: null });
    await setDemoAccount(postAccount({ customer_id: "C0002" }, { cookie }));
    const res = getDataRef(new Request(ORIGIN, { headers: { cookie } }), ref);
    expect(res.status).toBe(404);
  });

  it("切換後的 session 內部身分為新客戶，不沿用舊客戶", async () => {
    const { cookie } = await newSession();
    await setDemoAccount(postAccount({ customer_id: "C0003" }, { cookie }));
    const s = sessionFromRequest(new Request(ORIGIN, { headers: { cookie } }))!;
    expect(s.customerId).toBe("C0003");
    expect(s.dataRefs.size).toBe(0);
  });

  it("Origin 缺少或跨站時 403，且不切換", async () => {
    const { cookie, session } = await newSession();
    const noOrigin = new Request(`${ORIGIN}/api/demo/account`, {
      method: "POST", headers: { cookie }, body: JSON.stringify({ customer_id: "C0002" }),
    });
    const cross = postAccount({ customer_id: "C0002" }, { cookie, origin: "http://evil.example" });
    for (const req of [noOrigin, cross]) {
      const res = await setDemoAccount(req);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
    }
    expect(session.customerId).toBe("C0001");
  });

  it("Origin 與 Host 標頭同源（localhost 對 127.0.0.1 反向代理情境）時接受", async () => {
    const { cookie } = await newSession();
    const res = await setDemoAccount(
      postAccount({ customer_id: "C0002" }, { cookie, origin: "http://localhost:3000", host: "localhost:3000" }),
    );
    expect(res.status).toBe(200);
  });

  it("忽略 Browser 偽造的內部身分標頭", async () => {
    const { cookie } = await newSession();
    const forged = { "X-Demo-Customer-Id": "C0004", "X-Internal-Token": "x" };
    const get = getDemoAccount(new Request(ORIGIN, { headers: { cookie, ...forged } }));
    expect((await get.json()).customer_id).toBe("C0001");
    const post = await setDemoAccount(postAccount({ customer_id: "C0002" }, { cookie, ...forged }));
    expect((await post.json()).customer_id).toBe("C0002");
    const s = sessionFromRequest(new Request(ORIGIN, { headers: { cookie } }))!;
    expect(s.customerId).toBe("C0002");
  });

  it("失效 Session 的 POST 安全重建為新 session，不恢復舊資料權限", async () => {
    const { cookie: stale, session: old } = await newSession();
    const ref = registerDataRef(old, "t", { status: "success", data: { secret: 1 }, error: null });
    clearAllSessions(); // 模擬伺服器重啟
    const res = await setDemoAccount(postAccount({ customer_id: "C0002" }, { cookie: stale }));
    expect(res.status).toBe(200);
    const fresh = cookieOf(res);
    expect(fresh).not.toBe(stale);
    expect(getDataRef(new Request(ORIGIN, { headers: { cookie: fresh } }), ref).status).toBe(404);
  });
});

describe("失效 Session 的 GET", () => {
  it("重新發新 Cookie 並回到預設 C0001", async () => {
    const res = getDemoAccount(new Request(ORIGIN, { headers: { cookie: "telcocare_session=gone" } }));
    expect((await res.json()).customer_id).toBe("C0001");
    expect(res.headers.get("set-cookie")).toMatch(/telcocare_session=/);
  });
});
