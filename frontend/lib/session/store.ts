import { randomUUID } from "node:crypto";
import type { ToolEnvelope } from "@/lib/contracts";

export const DEFAULT_CUSTOMER_ID = "C0001";

export type DataRefEntry = { tool: string; envelope: ToolEnvelope<unknown> };

export type DemoSession = {
  id: string;
  customerId: string;
  dataRefs: Map<string, DataRefEntry>;
};

// 單機單程序記憶體（SPEC §6.3）；掛在 globalThis 以免 dev HMR 重置。
const g = globalThis as unknown as { __telcocareSessions?: Map<string, DemoSession> };
const sessions = (g.__telcocareSessions ??= new Map<string, DemoSession>());

export function createSession(): DemoSession {
  const session: DemoSession = { id: randomUUID(), customerId: DEFAULT_CUSTOMER_ID, dataRefs: new Map() };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string | undefined): DemoSession | undefined {
  return id ? sessions.get(id) : undefined;
}

/** 切換客戶：換身分並清掉所有舊客戶的工具快取（日後 Quote 也在此清除）。 */
export function switchCustomer(session: DemoSession, customerId: string): void {
  session.customerId = customerId;
  session.dataRefs.clear();
}

export function registerDataRef(session: DemoSession, tool: string, envelope: ToolEnvelope<unknown>): string {
  const ref = `ref_${randomUUID()}`;
  session.dataRefs.set(ref, { tool, envelope });
  return ref;
}

export function resolveDataRef(session: DemoSession | undefined, ref: string): DataRefEntry | undefined {
  return session?.dataRefs.get(ref);
}

export function clearAllSessions(): void {
  sessions.clear();
}
