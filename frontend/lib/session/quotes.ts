import { randomUUID } from "node:crypto";
import type { PlanChangeEstimate } from "@/lib/contracts";
import type { DemoSession } from "./store";

export const QUOTE_TTL_MS = 10 * 60 * 1000;

export type QuoteStatus = "VALID" | "CONSUMED" | "CANCELLED" | "EXPIRED";

/** Session 記憶體中的 Quote（SPEC §6.3）。非模型可見 Input；到期以真實時間戳判斷，與固定業務日分開。 */
export type Quote = {
  quote_id: string;
  session_id: string;
  customer_id: string;
  subscription_id: string;
  old_plan_id: string;
  new_plan_id: string;
  current_monthly_fee: number;
  new_monthly_fee: number;
  monthly_delta: number;
  policy_refs: string[];
  created_at: string;
  expires_at: string;
  status: QuoteStatus;
  request_id?: string;
};

/** 台北時間（+08:00）的 ISO 8601 字串，內容對應同一個真實時間點。 */
export function toOffsetIso(ms: number): string {
  return new Date(ms + 8 * 3600_000).toISOString().replace("Z", "+08:00");
}

export function createQuote(
  session: DemoSession,
  estimate: PlanChangeEstimate,
  subscriptionId: string,
  now = Date.now(),
): Quote {
  const quote: Quote = {
    quote_id: `Q-${randomUUID()}`,
    session_id: session.id,
    customer_id: session.customerId,
    subscription_id: subscriptionId,
    old_plan_id: estimate.current_plan_id,
    new_plan_id: estimate.new_plan_id,
    current_monthly_fee: estimate.current_monthly_fee,
    new_monthly_fee: estimate.new_monthly_fee,
    monthly_delta: estimate.monthly_delta,
    policy_refs: estimate.policy_refs,
    created_at: toOffsetIso(now),
    expires_at: toOffsetIso(now + QUOTE_TTL_MS),
    status: "VALID",
  };
  session.quotes.set(quote.quote_id, quote);
  return quote;
}

/** 只回傳屬於此 Session／目前客戶、狀態 VALID 且未過期的 Quote；過期者順手標記 EXPIRED。 */
export function getValidQuote(session: DemoSession | undefined, quoteId: string, now = Date.now()): Quote | undefined {
  const quote = session?.quotes.get(quoteId);
  if (!session || !quote) return undefined;
  if (quote.session_id !== session.id || quote.customer_id !== session.customerId) return undefined;
  if (quote.status === "VALID" && Date.parse(quote.expires_at) <= now) quote.status = "EXPIRED";
  return quote.status === "VALID" ? quote : undefined;
}

/** 取消尚未使用的 Quote；不碰任何已提交的申請。 */
export function cancelQuote(session: DemoSession, quoteId: string): boolean {
  const quote = getValidQuote(session, quoteId);
  if (!quote) return false;
  quote.status = "CANCELLED";
  return true;
}

/**
 * confirm 可用的 Quote：VALID 且未過期，或同 Session／客戶已 CONSUMED 且有確認關聯（request_id）者
 * （供冪等重送）。CANCELLED／EXPIRED／他人 Quote 一律不可。
 */
export function getQuoteForConfirm(session: DemoSession | undefined, quoteId: string, now = Date.now()): Quote | undefined {
  const valid = getValidQuote(session, quoteId, now);
  if (valid) return valid;
  const quote = session?.quotes.get(quoteId);
  const ok = quote && session && quote.status === "CONSUMED" && quote.request_id
    && quote.session_id === session.id && quote.customer_id === session.customerId;
  return ok ? quote : undefined;
}

/** 寫入成功（已 commit）後才消耗 Quote 並記下確認關聯。 */
export function consumeQuote(quote: Quote, requestId: string): void {
  quote.status = "CONSUMED";
  quote.request_id = requestId;
}
