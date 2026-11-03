import { createSession, getSession, type DemoSession } from "./store";

export const SESSION_COOKIE = "telcocare_session";

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

export function sessionFromRequest(req: Request): DemoSession | undefined {
  return getSession(readCookie(req, SESSION_COOKIE));
}

/** 沒有有效 Session 時建立新的（預設 C0001），並回傳要附加的 Set-Cookie。 */
export function ensureSession(req: Request): { session: DemoSession; setCookie: string | null } {
  const existing = sessionFromRequest(req);
  if (existing) return { session: existing, setCookie: null };
  const session = createSession();
  return {
    session,
    setCookie: `${SESSION_COOKIE}=${session.id}; Path=/; HttpOnly; SameSite=Lax`,
  };
}

export function jsonWithSession(body: unknown, setCookie: string | null, status = 200): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

/** 變更狀態的請求需帶同源 Origin（SPEC §6.2）；缺少或與 Host 不同一律視為跨站。 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = req.headers.get("host") ?? new URL(req.url).host;
  return originHost === host;
}
