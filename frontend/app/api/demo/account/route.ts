import { getDemoAccount } from "@/lib/server/handlers";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return getDemoAccount(req);
}
