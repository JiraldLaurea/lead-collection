import { runScheduledAutoEmailCycle } from "@/lib/hosted-auto-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return Response.json(await runScheduledAutoEmailCycle());
  } catch (error) {
    console.error("[AUTO-EMAIL CRON]", error);
    return Response.json({ processed: false, reason: "Automation cycle failed." }, { status: 500 });
  }
}
