import { confirmPlanChange } from "@/lib/server/plan-change-handlers";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return confirmPlanChange(req);
}
