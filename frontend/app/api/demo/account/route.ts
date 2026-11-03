import { getDemoAccount, setDemoAccount } from "@/lib/server/handlers";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return getDemoAccount(req);
}

export function POST(req: Request) {
  return setDemoAccount(req);
}
