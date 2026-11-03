import { getPolicyRefs } from "@/lib/server/handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return getPolicyRefs(req);
}
