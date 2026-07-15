import { runScheduledSmeSearch } from "@/lib/sme/scheduled-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return Response.json(await runScheduledSmeSearch());
  } catch (error) {
    console.error("[SME SEARCH CRON]", error);
    return Response.json({ processed: false, reason: "Scheduled SME search failed." }, { status: 500 });
  }
}
