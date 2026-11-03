import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { AISDKToolkit } from "@assistant-ui/ai-sdk";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import toolkit from "@/app/toolkit";
import { toolInputSchemas } from "@/lib/contracts";
import { executeReadTool } from "@/lib/server/tool-executor";
import { ensureSession } from "@/lib/session/http";
import { RUNTIME_ADDENDUM, SYSTEM_PROMPT } from "@/lib/system-prompt";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const aiToolkit = new AISDKToolkit({ toolkit });

const NOT_CONFIGURED = "目前系統無法完成這項操作，請稍後再試。";

export async function POST(req: Request) {
  const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } = process.env;
  if (!LLM_API_KEY || !LLM_BASE_URL || !LLM_MODEL) {
    // 不用 Mock 代替真模型：未設定就明確失敗。
    return Response.json({ error: NOT_CONFIGURED, detail: "LLM_* 環境變數尚未設定" }, { status: 503 });
  }
  const { session, setCookie } = ensureSession(req);
  const { messages, tools: frontend } = await req.json();

  const provider = createOpenAICompatible({ name: "llm", baseURL: LLM_BASE_URL, apiKey: LLM_API_KEY });

  const businessTools = {
    get_my_subscription: tool({
      description: "查詢目前客戶的訂閱方案（方案、月租、流量、合約到期日）。無參數。",
      inputSchema: toolInputSchemas.get_my_subscription,
      execute: async (args) => executeReadTool(session, "get_my_subscription", args),
    }),
    list_plans: tool({
      description: "列出目前有效的資費方案（月租、流量、通話分鐘）。max_monthly_fee 為非負整數預算上限，可省略；無符合方案時回傳空清單。",
      inputSchema: toolInputSchemas.list_plans,
      execute: async (args) => executeReadTool(session, "list_plans", args),
    }),
    get_my_bill: tool({
      description: "查詢目前客戶的月份帳單（金額、到期日、繳費狀態）。billing_month 格式 YYYY-MM，可省略；省略時查最新有資料月份。",
      inputSchema: toolInputSchemas.get_my_bill,
      execute: async (args) => executeReadTool(session, "get_my_bill", args),
    }),
    search_policy: tool({
      description: "搜尋虛構電信公司的合約、流量、帳單、解約與變更政策（本地知識庫）。query 為使用者的政策問題。查無依據會回 INSUFFICIENT_EVIDENCE。",
      inputSchema: toolInputSchemas.search_policy,
      execute: async (args) => executeReadTool(session, "search_policy", args),
    }),
    get_my_usage: tool({
      description: "查詢目前客戶的月份流量與通話用量（額度、已用、剩餘、超額、語音分鐘）。month 格式 YYYY-MM，可省略；省略時查最新有資料月份。",
      inputSchema: toolInputSchemas.get_my_usage,
      execute: async (args) => executeReadTool(session, "get_my_usage", args),
    }),
  };

  const result = streamText({
    model: provider.chatModel(LLM_MODEL),
    system: `${SYSTEM_PROMPT}\n${RUNTIME_ADDENDUM}`,
    messages: await convertToModelMessages(messages),
    tools: { ...(await aiToolkit.tools({ frontend })), ...businessTools },
    stopWhen: stepCountIs(6),
    abortSignal: AbortSignal.timeout(60_000),
  });

  const response = result.toUIMessageStreamResponse();
  if (setCookie) response.headers.append("Set-Cookie", setCookie);
  return response;
}
