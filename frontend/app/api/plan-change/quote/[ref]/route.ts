import { getQuoteView } from "@/lib/server/plan-change-handlers";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  return getQuoteView(req, ref);
}
