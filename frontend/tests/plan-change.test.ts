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
    expect(res.status).toBe(404);
    expect(getValidQuote(session, id)?.status).toBe("VALID");
  });

  it("取消不影響其他狀態：cancelQuote 對已取消者回 false", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    expect(cancelQuote(session, id)).toBe(true);
    expect(cancelQuote(session, id)).toBe(false);
  });
});

describe("PlanChangeCard 資料來源與確認閘門", () => {
  it("quote view 只回顯可信資料與政策提醒", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    const res = getQuoteView(cookieReq(session.id), id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ current_plan_id: "P499", new_plan_id: "P699", monthly_delta: 200, quote_id: id });
    expect("subscription_id" in body.data).toBe(false);
  });

  it("寫入功能未完成前，confirm 不虛報成功、Quote 保持 VALID", async () => {
    const { session, result } = await estimate();
    const id = (result.data as { quote_id: string }).quote_id;
    const res = await confirmPlanChange(cookieReq(session.id, { quote_id: id }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(getValidQuote(session, id)?.status).toBe("VALID");
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
