"use client";

import {
  AuiIf,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  SuggestionPrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { OPENING_LINE } from "@/lib/system-prompt";
import { ToolTrace } from "./ToolTrace";

function Opening() {
  return (
    <div className="msg assistant" data-testid="opening-line">
      {OPENING_LINE.split("\n").map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}

function Parts() {
  return (
    <MessagePrimitive.Parts>
      {({ part }) => {
        if (part.type === "text") return <MessagePartPrimitive.Text />;
        if (part.type === "tool-call") return part.toolUI ?? <ToolTrace {...part} />;
        return null;
      }}
    </MessagePrimitive.Parts>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="msg user">
      <Parts />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="msg assistant">
      <Parts />
      <AuiIf condition={(s) => s.message.status?.type === "running"}>
        <span className="thinking" aria-live="polite">思考中…</span>
      </AuiIf>
      <MessagePrimitive.Error />
    </MessagePrimitive.Root>
  );
}

export function Thread() {
  return (
    <ThreadPrimitive.Root className="thread">
      <ThreadPrimitive.Viewport className="viewport">
        <Opening />
        <AuiIf condition={(s) => s.thread.isEmpty}>
          <div className="suggestions" aria-label="示範問題">
            <ThreadPrimitive.Suggestions>
              {() => (
                <SuggestionPrimitive.Trigger send asChild>
                  <button className="suggestion" type="button">
                    <SuggestionPrimitive.Title />
                  </button>
                </SuggestionPrimitive.Trigger>
              )}
            </ThreadPrimitive.Suggestions>
          </div>
        </AuiIf>
        <ThreadPrimitive.Messages>
          {({ message }) => (message.role === "user" ? <UserMessage /> : <AssistantMessage />)}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>
      <ComposerPrimitive.Root className="composer">
        <ComposerPrimitive.Input placeholder="輸入問題，例如：我現在是什麼方案？" rows={1} />
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send className="send">送出</ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel className="send">停止</ComposerPrimitive.Cancel>
        </AuiIf>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}
