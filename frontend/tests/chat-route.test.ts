import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// toolkit.tsx 需要 use-generative 編譯器；路由失敗處理與 GenUI 無關，以空 toolkit 取代。
vi.mock("@/app/toolkit", () => ({ default: {} }));
import { POST } from "@/app/api/chat/route";
import { PROVIDER_UNAVAILABLE_MESSAGE } from "@/lib/server/chat-runtime";

let mode: "500" | "cut" | "reason" = "500";
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    if (mode === "500") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "boom sk-secret-key" } }));
      return;
    }
    if (mode === "reason") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const chunk = (delta: object, finish: string | null = null) =>
        `data: ${JSON.stringify({ id: "1", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
      res.write(chunk({ role: "assistant", reasoning_content: "PRIVATE-THOUGHT" }));
      res.write(chunk({ content: "你好" }));
      res.write(chunk({}, "stop"));
      res.end("data: [DONE]\n\n");
      return;
    }
    // 串流送出一半就中斷連線
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write('data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"已建"}}]}\n\n');
    setTimeout(() => res.destroy(), 20);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.LLM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.LLM_API_KEY = "sk-secret-key";
  process.env.LLM_MODEL = "test-model";
});
afterAll(() => server.close());

const request = () =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "我要升級 P699" }] }],
      tools: {},
    }),
  });

describe("POST /api/chat 失敗處理（E08）", () => {
  it("Provider 回 500：串流帶固定錯誤句，不含金鑰或原始訊息，也沒有任何成功字樣", async () => {
    mode = "500";
    const text = await (await POST(request())).text();
    expect(text).toContain(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(text).not.toContain("sk-secret-key");
    expect(text).not.toContain("boom");
  });

  it("模型串流中斷：結尾是錯誤事件，不宣稱申請已建立", async () => {
    mode = "cut";
    const text = await (await POST(request())).text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain(PROVIDER_UNAVAILABLE_MESSAGE);
    expect(text).not.toContain("sk-secret-key");
  });

  it("不把模型的私密推理（reasoning）送到瀏覽器", async () => {
    mode = "reason";
    const text = await (await POST(request())).text();
    expect(text).toContain("你好");
    expect(text).not.toContain("PRIVATE-THOUGHT");
    expect(text).not.toContain("reasoning");
  });

  it("LLM 未設定：503 明確失敗", async () => {
    const saved = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;
    const res = await POST(request());
    process.env.LLM_API_KEY = saved;
    expect(res.status).toBe(503);
  });
});
