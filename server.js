const http = require("http");
const next = require("next");
const { PrismaClient } = require("@prisma/client");
const { getClientIpFromNodeRequest, isIpAllowed } = require("./server/access-control.cjs");

process.env.DATABASE_URL ||= "file:../data/leads.sqlite";
process.env.NODE_ENV ||= "production";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.BIND_HOST || "0.0.0.0";
const port = Number(process.env.APP_PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

function forbidden(res, ip) {
  res.statusCode = 403;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html><head><title>403 Forbidden</title></head><body><h1>403 Forbidden</h1><p>This application is restricted to the approved office network only.</p><p>Your IP address is not allowed.</p><p>Detected IP: ${ip}</p></body></html>`);
}

app.prepare().then(() => {
  http
    .createServer(async (req, res) => {
      const ip = getClientIpFromNodeRequest(req);
      const decision = isIpAllowed(ip);
      try {
        await prisma.accessLog.create({
          data: {
            ipAddress: ip,
            path: req.url || "/",
            method: req.method || "GET",
            decision: decision.allowed ? "ALLOWED" : "BLOCKED",
            reason: decision.reason
          }
        });
      } catch {
        // Logging must never make the server unreachable.
      }

      if (!decision.allowed) {
        forbidden(res, ip);
        return;
      }

      handle(req, res);
    })
    .listen(port, hostname, () => {
      console.log(`Office LAN app ready on http://${hostname}:${port}`);
    });
});
