import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Lets release verification build into an isolated directory while `next dev`
  // continues to use .next. This prevents development artifacts from being read as
  // a production route manifest on Windows.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // "smpp" opens raw TCP/TLS sockets via Node's net/tls, so webpack must not try to bundle it
  // ("Module not found: Can't resolve 'net'"). Left external, it is required natively at
  // runtime on the Node server, where those modules exist.
  serverExternalPackages: ["@prisma/adapter-libsql", "@libsql/client", "libsql", "smpp"]
};

export default nextConfig;
