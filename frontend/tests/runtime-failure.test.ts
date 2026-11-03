import { describe, expect, it } from "vitest";
import {
  MAX_TOOL_STEPS, TURN_BUDGET_MS, TIMEOUT_MESSAGE, PROVIDER_UNAVAILABLE_MESSAGE,
  describeStreamError, prepareStep, guardUIStream,
} from "@/lib/server/chat-runtime";
import { executeReadTool } from "@/lib/server/tool-executor";
import { createSession } from "@/lib/session/store";

async function collect(stream: ReadableStream<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}
function streamOf(...chunks: unknown[]): ReadableStream<unknown> {
  return new ReadableStream({ start(c) { chunks.forEach((x) => c.enqueue(x)); c.close(); } });
}

describe("執行預算（SPEC §10.1）", () => {
  it("預設為每輪六個工具步驟與六十秒", () => {
    expect(MAX_TOOL_STEPS).toBe(6);
    expect(TURN_BUDGET_MS).toBe(60_000);
  });

  it("第七步（工具步驟用完後）禁止再派送工具，其餘步驟不受限", () => {
    expect(prepareStep({ stepNumber: 0 })).toBeUndefined();
    expect(prepareStep({ stepNumber: MAX_TOOL_STEPS - 1 })).toBeUndefined();
    expect(prepareStep({ stepNumber: MAX_TOOL_STEPS })).toEqual({ toolChoice: "none" });
  });
});

describe("模型串流錯誤（E08）", () => {
  it("Provider 錯誤只回固定句，不洩漏 API Key 或原始訊息", () => {
    const msg = describeStreamError(new Error("401 Incorrect API key sk-secret-123"));
    expect(msg).toBe(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(msg).not.toContain("sk-");
  });

  it("逾時／中止錯誤回逾時說明，且不宣稱遠端已停止", () => {
    const err = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(describeStreamError(err)).toBe(TIMEOUT_MESSAGE);
    expect(TIMEOUT_MESSAGE).not.toMatch(/已停止|已建立/);
  });

  it("兩種訊息都不宣稱申請已建立", () => {
    for (const m of [TIMEOUT_MESSAGE, PROVIDER_UNAVAILABLE_MESSAGE]) expect(m).not.toMatch(/已建立|已送出|成功/);
  });
});

describe("逾時要讓使用者看見", () => {
  it("逾時造成的 abort chunk 轉成 error chunk", async () => {
    const out = await collect(
      guardUIStream(streamOf({ type: "start" }, { type: "abort", reason: "TimeoutError: The operation was aborted due to timeout" }) as never),
    );
    expect(out).toEqual([{ type: "start" }, { type: "error", errorText: TIMEOUT_MESSAGE }]);
  });

  it("使用者主動中止的 abort chunk 不改寫", async () => {
    const chunk = { type: "abort", reason: "user stopped" };
    expect(await collect(guardUIStream(streamOf(chunk) as never))).toEqual([chunk]);
  });

  it("Provider 連線中途斷掉（stream 丟例外）：補固定句 error chunk，不外洩原始訊息", async () => {
    let n = 0;
    const broken = new ReadableStream({
      pull(c) {
        if (n++ === 0) c.enqueue({ type: "text-delta", id: "1", delta: "x" });
        else c.error(new Error("socket hang up sk-secret"));
      },
    });
    const out = await collect(guardUIStream(broken as never));
    expect(out).toEqual([{ type: "text-delta", id: "1", delta: "x" }, { type: "error", errorText: PROVIDER_UNAVAILABLE_MESSAGE }]);
  });

  it("一般 chunk 原樣通過", async () => {
    const chunks = [{ type: "start" }, { type: "text-delta", id: "1", delta: "hi" }, { type: "finish" }];
    expect(await collect(guardUIStream(streamOf(...chunks) as never))).toEqual(chunks);
  });
});

describe("工具層逾時與取消", () => {
  const session = () => createSession();

  it("內部服務逾時視為 INTERNAL_ERROR 且只重試一次，不宣稱成功", async () => {
    let calls = 0;
    const fetch = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        calls++;
        init.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      });
    const r = await executeReadTool(session(), "get_my_subscription", {}, { fetch, timeoutMs: 20 });
    expect(r.status).toBe("error");
    expect(r.error?.code).toBe("INTERNAL_ERROR");
    expect(calls).toBe(2);
    expect(r.data_ref).toBeNull();
  });

  it("整輪預算已用完（signal 已中止）時不再重試、不發新請求", async () => {
    const ctrl = new AbortController();
    let calls = 0;
    const fetch = async (_u: string, init: RequestInit) => {
      calls++;
      ctrl.abort();
      if (init.signal?.aborted) throw new Error("aborted");
      return new Response("{}");
    };
    const r = await executeReadTool(session(), "get_my_subscription", {}, { fetch, signal: ctrl.signal });
    expect(r.status).toBe("error");
    expect(calls).toBe(1);
    const again = await executeReadTool(session(), "get_my_subscription", {}, { fetch, signal: ctrl.signal });
    expect(again.status).toBe("error");
    expect(calls).toBe(1);
  });
});
