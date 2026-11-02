import { getDataRef } from "@/lib/server/handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  return getDataRef(req, ref);
}
