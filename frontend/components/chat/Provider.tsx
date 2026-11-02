"use client";

import { AssistantRuntimeProvider, AuiConfig, Suggestions, Tools } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import toolkit from "@/app/toolkit";
import { DEMO_QUESTIONS } from "@/lib/demo-questions";

export function Provider({ children }: { children: React.ReactNode }) {
  // present 是前端工具：需 sendAutomaticallyWhen，結果回送後模型才會續接。
  const runtime = useChatRuntime({ sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls });
  const config = AuiConfig({ tools: Tools({ toolkit }), suggestions: Suggestions(DEMO_QUESTIONS) });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      {children}
    </AssistantRuntimeProvider>
  );
}
