import { beforeEach, describe, expect, it } from "vitest";
import { executeReadTool } from "@/lib/server/tool-executor";
import { cancelPlanChange, confirmPlanChange, getQuoteView } from "@/lib/server/plan-change-handlers";
import { cancelQuote, getValidQuote, QUOTE_TTL_MS } from "@/lib/session/quotes";
import { clearAllSessions, createSession, switchCustomer } from "@/lib/session/store";

const upgrade = {
  status: "success",
  data: {
    eligible: true, reason_code: null, current_plan_id: "P499", new_plan_id: "P699",
    current_monthly_fee: 499, new_monthly_fee: 699, monthly_delta: 200,
    quote_id: null, expires_at: null, policy_refs: ["plan_change_policy#upgrade_rules"],
    subscription_id: "S0001",
  },
  error: null,
};
const blocked = {
  status: "success",
  data: { ...upgrade.data, eligible: false, reason_code: "DOWNGRADE_BEFORE_CONTRACT_END", new_plan_id: "P499", monthly_delta: -200 },
  error: null,
};
const conflict = { status: "error", data: null, error: { code: "CONFLICT", message: "已有待審" } };

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, calls };
}

beforeEach(() => clearAllSessions());

async function estimate(session = createSession(), body: unknown = upgrade) {
  const { fetch } = fakeFetch(body);
  const result = await executeReadTool(session, "estimate_plan_change", { new_plan_id: "P699" }, { fetch });
  return { session, result };
}

describe("estimate_plan_change（T06／T10／T11）", () => {
  it("T06：合格時 Next.js 建立不可預測 Quote 與十分鐘期限，且不外洩內部欄位", async () => {
    const { session, result } = await estimate();
    expect(result.status).toBe("success");
    const d = result.data as Record<string, unknown>;
    expect(d.quote_id).toMatch(/^Q-[0-9a-f-]{36}$/);
    expect(d.monthly_delta).toBe(200);
    expect("subscription_id" in d).toBe(false);
    const expires = Date.parse(d.expires_at as string);
    expect(expires - Date.now()).toBeGreaterThan(QUOTE_TTL_MS - 5_000);
    expect(expires - Date.now()).toBeLessThanOrEqual(QUOTE_TTL_MS);
    expect(d.expires_at).toMatch(/\+08:00$/);
    const q = getValidQuote(session, d.quote_id as string);
    expect(q).toMatchObject({ customer_id: "C0001", subscription_id: "S0001", old_plan_id: "P499", new_plan_id: "P699", session_id: session.id });
  });

  it("兩次評估的 quote_id 不同", async () => {
    const a = await estimate();
    const b = await estimate();
    expect((a.result.data as { quote_id: string }).quote_id).not.toBe((b.result.data as { quote_id: string }).quote_id);
  });

  it("T10：不合格不建立 Quote", async () => {
    const { session, result } = await estimate(createSession(), blocked);
    const d = result.data as { quote_id: unknown; expires_at: unknown; reason_code: string };
    expect(d.quote_id).toBeNull();
    expect(d.expires_at).toBeNull();
    expect(d.reason_code).toBe("DOWNGRADE_BEFORE_CONTRACT_END");
    expect(session.quotes.size).toBe(0);
  });

  it("T11：CONFLICT 原樣回傳且無 Quote", async () => {
    const { session, result } = await estimate(createSession(), conflict);
    expect(result).toMatchObject({ status: "error", error: { code: "CONFLICT" } });
    expect(session.quotes.size).toBe(0);
  });

  it("拒絕模型塞入的身分欄位與格式錯誤的方案 ID，不發內部請求", async () => {
    const session = createSession();
    const { fetch, calls } = fakeFetch(upgrade);
    for (const args of [{ new_plan_id: "P699", customer_id: "C0002" }, { new_plan_id: "699" }, {}]) {
      const r = await executeReadTool(session, "estimate_plan_change", args, { fetch });
      expect(r).toMatchObject({ status: "error", error: { code: "VALIDATION_ERROR" } });
    }
    expect(calls).toHaveLength(0);
  });
});

describe("create_plan_change_request 由模型呼叫（T07／T15）", () => {
  it("一律 CONFIRMATION_REQUIRED，不發任何內部請求（即使 Quote 有效）", async () => {
    const { session, result } = await estimate();
    const quoteId = (result.data as { quote_id: string }).quote_id;
    const { fetch, calls } = fakeFetch({ status: "success", data: {}, error: null });
    const r = await executeReadTool(session, "create_plan_change_request", { quote_id: quoteId }, { fetch });
    expect(r).toMatchObject({ status: "error", data: null, error: { code: "CONFIRMATION_REQUIRED" } });
    expect(calls).toHaveLength(0);
    expect(getValidQuote(session, quoteId)?.status).toBe("VALID");
  });

  it("夾帶 confirmed=true 之類授權欄位被拒（VALIDATION_ERROR），仍不發請求", async () => {
    const session = createSession();
    const { fetch, calls } = fakeFetch({});
    const r = await executeReadTool(session, "create_plan_change_request", { quote_id: "Q-x", confirmed: true }, { fetch });
    expect(r).toMatchObject({ status: "error", error: { code: "VALIDATION_ERROR" } });
    expect(calls).toHaveLength(0);
  });
});

describe("Quote 生命週期（E01／E02／E03）", () => {
  it("E01：超過十分鐘即 EXPIRED，無法取得", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    expect(getValidQuote(session, id, Date.now() + QUOTE_TTL_MS - 1000)).toBeDefined();
    expect(getValidQuote(session, id, Date.now() + QUOTE_TTL_MS + 1000)).toBeUndefined();
    expect(session.quotes.get(id)?.status).toBe("EXPIRED");
  });

  it("E02：取消後 Quote 無法使用，且不寫入資料庫", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    const res = await cancelPlanChange(cookieReq(session.id, { quote_id: id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "success", data: { cancelled: true }, error: null });
    expect(getValidQuote(session, id)).toBeUndefined();
    const again = await confirmPlanChange(cookieReq(session.id, { quote_id: id }));
    expect(again.status).not.toBe(200);
  });

  it("E03：切換客戶後舊 Quote 失效", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    switchCustomer(session, "C0002");
    expect(getValidQuote(session, id)).toBeUndefined();
    expect(session.quotes.size).toBe(0);
  });

  it("重啟（記憶體清空）後舊 Quote 無法使用", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    clearAllSessions();
    const res = getQuoteView(cookieReq(session.id), id);
    expect(res.status).toBe(404);
  });

  it("其他 Session 無法取消或讀取我的 Quote", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    const other = createSession();
    expect(getValidQuote(other, id)).toBeUndefined();
    const res = await cancelPlanChange(cookieReq(other.id, { quote_id: id }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toEqual({ code: "QUOTE_EXPIRED", message: EXPIRED_MSG });
    expect(getValidQuote(session, id)?.status).toBe("VALID");
  });

  it("取消不影響其他狀態：cancelQuote 對已取消者回 false", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    expect(cancelQuote(session, id)).toBe(true);
    expect(cancelQuote(session, id)).toBe(false);
  });
});

const EXPIRED_MSG = "此方案變更評估已過期，請重新查詢並確認。";

describe("PlanChangeCard 資料來源與確認閘門", () => {
  it("confirm 對失效 Quote 回 409 QUOTE_EXPIRED 與 System Prompt 固定句", async () => {
    const { session } = await estimate();
    const res = await confirmPlanChange(cookieReq(session.id, { quote_id: "Q-missing" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toEqual({ code: "QUOTE_EXPIRED", message: EXPIRED_MSG });
  });

  it("cancel 對已取消的 Quote 回 409 QUOTE_EXPIRED", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    await cancelPlanChange(cookieReq(session.id, { quote_id: id }));
    const res = await cancelPlanChange(cookieReq(session.id, { quote_id: id }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toEqual({ code: "QUOTE_EXPIRED", message: EXPIRED_MSG });
  });

  it("quote view 只回顯可信資料與政策提醒", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    const res = getQuoteView(cookieReq(session.id), id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ current_plan_id: "P499", new_plan_id: "P699", monthly_delta: 200, quote_id: id });
    expect("subscription_id" in body.data).toBe(false);
  });

  it("跨站請求（無同源 Origin）被拒", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    const req = new Request("http://x/api/plan-change/cancel", {
      method: "POST",
      headers: { cookie: `telcocare_session=${session.id}` },
      body: JSON.stringify({ quote_id: id }),
    });
    expect((await cancelPlanChange(req)).status).toBe(403);
    expect(getValidQuote(session, id)?.status).toBe("VALID");
  });
});

function cookieReq(sessionId: string, body?: unknown): Request {
  return new Request("http://x/api/plan-change/x", {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie: `telcocare_session=${sessionId}`, origin: "http://x", host: "x", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---- 工單 08：確認並建立唯一待審申請 ----

const created = (over: Record<string, unknown> = {}) => ({
  status: "success",
  data: {
    request_id: "R-ABC123", quote_id: "Q-x", old_plan_id: "P499", new_plan_id: "P699",
    status: "PENDING", created_at: "2026-11-03T10:00:00+08:00", already_existed: false, ...over,
  },
  error: null,
});

/** 依 URL 路由的假 FastAPI；記錄所有內部請求。 */
function routedFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.endsWith(k));
    if (!key) throw new Error("unexpected " + url);
    return routes[key]();
  };
  return { fetch, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function quoteIn(session = createSession()) {
  const { result } = await estimate(session);
  return { session, id: (result.data as { quote_id: string }).quote_id };
}

describe("confirm_plan_change（T08／T09／E10）", () => {
  it("T08：有效 Quote 經受信任路徑建立 PENDING，只送 Quote 綁定資料，之後才消耗 Quote", async () => {
    const { session, id } = await quoteIn();
    const { fetch, calls } = routedFetch({ "/internal/actions/confirm_plan_change": () => json(created({ quote_id: id }), 201) });
    const res = await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toMatchObject({ request_id: "R-ABC123", status: "PENDING", already_existed: false });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      quote_id: id, subscription_id: "S0001", old_plan_id: "P499", new_plan_id: "P699",
    });
    expect((calls[0].init.headers as Record<string, string>)["X-Demo-Customer-Id"]).toBe("C0001");
    expect(session.quotes.get(id)).toMatchObject({ status: "CONSUMED", request_id: "R-ABC123" });
    expect(getValidQuote(session, id)).toBeUndefined();
  });

  it("T09：已消耗 Quote 在同 Session 重送回同一 request_id 與 already_existed=true", async () => {
    const { session, id } = await quoteIn();
    let n = 0;
    const { fetch } = routedFetch({
      "/internal/actions/confirm_plan_change": () => (n++ === 0 ? json(created(), 201) : json(created({ already_existed: true }), 200)),
    });
    await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    const again = await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    expect(again.status).toBe(200);
    expect((await again.json()).data).toMatchObject({ request_id: "R-ABC123", already_existed: true });
  });

  it("並行確認：兩個同時請求都得到同一 request_id，Quote 只消耗一次", async () => {
    const { session, id } = await quoteIn();
    let n = 0;
    const { fetch } = routedFetch({
      "/internal/actions/confirm_plan_change": async () => {
        await new Promise((r) => setTimeout(r, 5));
        return n++ === 0 ? json(created(), 201) : json(created({ already_existed: true }), 200);
      },
    });
    const [a, b] = await Promise.all([
      confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch }),
      confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch }),
    ]);
    const ids = [(await a.json()).data.request_id, (await b.json()).data.request_id];
    expect(new Set(ids).size).toBe(1);
    expect(session.quotes.get(id)?.status).toBe("CONSUMED");
  });

  it("模型塞入 confirmed 等多餘欄位、跨站、無 Session 一律不發內部請求", async () => {
    const { session, id } = await quoteIn();
    const { fetch, calls } = routedFetch({});
    const extra = await confirmPlanChange(cookieReq(session.id, { quote_id: id, confirmed: true }), { fetch });
    expect(extra.status).toBe(422);
    const noOrigin = new Request("http://x/api/plan-change/confirm", {
      method: "POST", headers: { cookie: `telcocare_session=${session.id}` }, body: JSON.stringify({ quote_id: id }),
    });
    expect((await confirmPlanChange(noOrigin, { fetch })).status).toBe(403);
    expect((await confirmPlanChange(cookieReq("no-such-session", { quote_id: id }), { fetch })).status).toBe(409);
    expect(calls).toHaveLength(0);
    expect(getValidQuote(session, id)?.status).toBe("VALID");
  });

  it("取消／過期／切換客戶／他人 Session 的 Quote 不可確認，也不發內部請求", async () => {
    const { fetch, calls } = routedFetch({});
    const a = await quoteIn();
    cancelQuote(a.session, a.id);
    expect((await confirmPlanChange(cookieReq(a.session.id, { quote_id: a.id }), { fetch })).status).toBe(409);
    const b = await quoteIn();
    b.session.quotes.get(b.id)!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect((await confirmPlanChange(cookieReq(b.session.id, { quote_id: b.id }), { fetch })).status).toBe(409);
    const c = await quoteIn();
    switchCustomer(c.session, "C0002");
    expect((await confirmPlanChange(cookieReq(c.session.id, { quote_id: c.id }), { fetch })).status).toBe(409);
    const d = await quoteIn();
    expect((await confirmPlanChange(cookieReq(createSession().id, { quote_id: d.id }), { fetch })).status).toBe(409);
    expect(calls).toHaveLength(0);
  });

  it("其他 Quote Pending 衝突／舊訂閱變動：回 FastAPI 錯誤、Quote 仍 VALID、不虛報成功", async () => {
    const { session, id } = await quoteIn();
    const err = (code: string) => ({ status: "error", data: null, error: { code, message: "m" } });
    const { fetch } = routedFetch({ "/internal/actions/confirm_plan_change": () => json(err("CONFLICT"), 409) });
    const res = await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
    expect(session.quotes.get(id)?.status).toBe("VALID");
  });

  it("E10：寫入結果不明時先查同 Quote 既有紀錄，找到就視為成功，且不重送 INSERT", async () => {
    const { session, id } = await quoteIn();
    const { fetch, calls } = routedFetch({
      "/internal/actions/confirm_plan_change": () => { throw new Error("timeout"); },
      "/internal/actions/find_plan_change_request": () => json(created({ already_existed: true })),
    });
    const res = await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ request_id: "R-ABC123", already_existed: true });
    expect(calls.filter((c) => c.url.endsWith("confirm_plan_change"))).toHaveLength(1);
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ quote_id: id });
    expect(session.quotes.get(id)?.status).toBe("CONSUMED");
  });

  it("E10：查無既有紀錄時回 INTERNAL_ERROR，不消耗 Quote、不自動重送", async () => {
    const { session, id } = await quoteIn();
    const notFound = { status: "error", data: null, error: { code: "NOT_FOUND", message: "m" } };
    const { fetch, calls } = routedFetch({
      "/internal/actions/confirm_plan_change": () => { throw new Error("timeout"); },
      "/internal/actions/find_plan_change_request": () => json(notFound, 404),
    });
    const res = await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL_ERROR");
    expect(calls.filter((c) => c.url.endsWith("confirm_plan_change"))).toHaveLength(1);
    expect(session.quotes.get(id)?.status).toBe("VALID");
  });

  it("失去 Session 後不得僅靠 Quote ID 取得資料；重啟後 Quote 消失", async () => {
    const { session, id } = await quoteIn();
    const { fetch, calls } = routedFetch({ "/internal/actions/confirm_plan_change": () => json(created(), 201) });
    await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    clearAllSessions();
    const again = await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    expect(again.status).toBe(409);
    expect(calls).toHaveLength(1);
  });

  it("quote view：已消耗者帶 request_id 供卡片重新掛載顯示成功", async () => {
    const { session, id } = await quoteIn();
    const { fetch } = routedFetch({ "/internal/actions/confirm_plan_change": () => json(created(), 201) });
    await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    const view = getQuoteView(cookieReq(session.id), id);
    expect(view.status).toBe(200);
    expect((await view.json()).data).toMatchObject({ request_id: "R-ABC123", new_plan_id: "P699" });
  });

  it("確認進行中被取消：DB 已寫入時 Quote 仍記下 request_id 並回成功，不顯示已取消", async () => {
    const { session, id } = await quoteIn();
    const { fetch } = routedFetch({
      "/internal/actions/confirm_plan_change": () => {
        cancelQuote(session, id);
        return json(created(), 201);
      },
    });
    const res = await confirmPlanChange(cookieReq(session.id, { quote_id: id }), { fetch });
    expect(res.status).toBe(201);
    expect(session.quotes.get(id)).toMatchObject({ status: "CONSUMED", request_id: "R-ABC123" });
  });
});
