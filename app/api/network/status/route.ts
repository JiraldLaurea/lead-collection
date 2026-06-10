import os from "os";
import { ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";

export async function GET() {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const interfaces = os.networkInterfaces();
  const privateAddresses = Object.values(interfaces)
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item?.address);
  return ok({
    appMode: process.env.APP_MODE || "office_lan_mvp",
    allowedCidrs: process.env.OFFICE_ALLOWED_CIDRS || "localhost only",
    bindHost: process.env.BIND_HOST || "0.0.0.0",
    port: process.env.APP_PORT || "3000",
    privateAddresses,
    publicAccessBlocked: process.env.BLOCK_PUBLIC_ACCESS !== "false",
    trustProxy: process.env.TRUST_PROXY === "true",
    serperApiKeyConfigured: Boolean(process.env.SERPER_API_KEY && !process.env.SERPER_API_KEY.startsWith("replace_"))
  });
}
