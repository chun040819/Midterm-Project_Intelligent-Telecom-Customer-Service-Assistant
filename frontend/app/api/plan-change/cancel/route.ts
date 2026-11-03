import { cancelPlanChange } from "@/lib/server/plan-change-handlers";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return cancelPlanChange(req);
}
