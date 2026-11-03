import { beforeEach, describe, expect, it } from "vitest";
import { executeReadTool } from "@/lib/server/tool-executor";
import { clearAllSessions, createSession, resolveDataRef, switchCustomer } from "@/lib/session/store";

const subscription = {
  status: "success",
  data: {
    subscription_id: "S0001",
    plan: { plan_id: "P499", name: "標準型", monthly_fee: 499, data_limit_gb: 25, voice_minutes: 80, is_active: true },
    contract_end_date: "2027-06-30",
  },
  error: null,
};

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

beforeEach(() => clearAllSessions());

describe("executeReadTool(get_my_subscription)", () => {
  it("以 session 客戶與伺服器 token 呼叫內部服務，並回傳可信 data_ref", async () => {
    const session = createSession();
    const { fetch, calls } = fakeFetch(() => json(subscription));
    const result = await executeReadTool(session, "get_my_subscription", {}, { fetch, baseUrl: "http://internal", token: "tok" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://internal/internal/tools/get_my_subscription");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["X-Demo-Customer-Id"]).toBe("C0001");
    expect(headers["X-Internal-Token"]).toBe("tok");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ arguments: {} });

    expect(result.status).toBe("success");
    expect(result.data_ref).toMatch(/^ref_/);
    expect(resolveDataRef(session, result.data_ref!)?.envelope).toEqual(subscription);
  });

  it("拒絕模型塞入的 customer_id，且不發出任何內部請求", async () => {
    const session = createSession();
    const { fetch, calls } = fakeFetch(() => json(subscription));
    const result = await executeReadTool(session, "get_my_subscription", { customer_id: "C0002" }, { fetch });
    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ status: "error", data_ref: null, error: { code: "VALIDATION_ERROR" } });
  });

  it("data_ref 只對建立它的 session 有效", async () => {
    const a = createSession();
    const b = createSession();
    const { fetch } = fakeFetch(() => json(subscription));
    const result = await executeReadTool(a, "get_my_subscription", {}, { fetch });
    expect(resolveDataRef(a, result.data_ref!)).toBeDefined();
    expect(resolveDataRef(b, result.data_ref!)).toBeUndefined();
    expect(resolveDataRef(undefined, result.data_ref!)).toBeUndefined();
  });

  it("FastAPI 業務錯誤原樣回傳，不產生 data_ref", async () => {
    const session = createSession();
    const notFound = { status: "error", data: null, error: { code: "NOT_FOUND", message: "查無" } };
    const { fetch, calls } = fakeFetch(() => json(notFound, 404));
    const result = await executeReadTool(session, "get_my_subscription", {}, { fetch });
    expect(result).toMatchObject({ status: "error", data_ref: null, error: { code: "NOT_FOUND" } });
    expect(calls).toHaveLength(1);
  });

  it("內部服務失敗時重試一次後回 INTERNAL_ERROR，不宣稱成功", async () => {
    const session = createSession();
    const { fetch, calls } = fakeFetch(() => new Response("boom", { status: 500 }));
    const result = await executeReadTool(session, "get_my_subscription", {}, { fetch });
    expect(calls).toHaveLength(2);
    expect(result).toMatchObject({ status: "error", data_ref: null, error: { code: "INTERNAL_ERROR" } });
  });
});

describe("客戶隔離證據（T13／E03）", () => {
  it("T13：模型輸入夾帶 customer_id 或其他身分欄位一律被拒，不發出內部請求", async () => {
    const session = createSession();
    const { fetch, calls } = fakeFetch(() => json(subscription));
    for (const args of [{ customer_id: "C0002" }, { session_id: "x" }, { internal_token: "x" }]) {
      const result = await executeReadTool(session, "get_my_subscription", args, { fetch });
      expect(result).toMatchObject({ status: "error", data_ref: null, error: { code: "VALIDATION_ERROR" } });
    }
    expect(calls).toHaveLength(0);
  });

  it("E03：切換客戶後，內部請求改用新客戶身分，舊 data_ref 失效", async () => {
    const session = createSession();
    const { fetch, calls } = fakeFetch(() => json(subscription));
    const before = await executeReadTool(session, "get_my_subscription", {}, { fetch });
    switchCustomer(session, "C0002");
    expect(resolveDataRef(session, before.data_ref!)).toBeUndefined();
    await executeReadTool(session, "get_my_subscription", {}, { fetch });
    const ids = calls.map((c) => (c.init.headers as Record<string, string>)["X-Demo-Customer-Id"]);
    expect(ids).toEqual(["C0001", "C0002"]);
  });
});
