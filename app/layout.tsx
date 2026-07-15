import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AutomationStatusBar } from "@/components/AutomationStatusBar";
import { Sidebar } from "@/components/Sidebar";
import { SmeScheduledSearchLocalTick } from "@/components/SmeScheduledSearchLocalTick";
import { isAdminAuthenticated } from "@/lib/auth";
import { getAutomationStatus } from "@/lib/auto-email";
import { isSmeSearchEnabled } from "@/lib/feature-flags";
import { ensureSmppBound } from "@/lib/sms";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Office LAN Lead Collection",
  description: "Internal Serper lead collection MVP"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Keeps the SMPP session bound so delivery receipts can arrive even when nothing is being
  // sent. A receipt can lag more than half an hour behind the send, and it can only land on a
  // live bind — binding lazily on send meant the app was deaf for most of its life, and every
  // receipt that arrived in the gap was lost. Deliberately not awaited: rendering must not
  // wait on a socket.
  void ensureSmppBound();

  const isAuthenticated = await isAdminAuthenticated();
  const automationStatus = isAuthenticated ? await getAutomationStatus() : null;
  const smeSearchEnabled = isAuthenticated ? await isSmeSearchEnabled() : false;

  return (
    <html lang="en">
      <body className={inter.className}>
        <div className={isAuthenticated ? "app-shell" : "app-shell app-shell-public"}>
          {isAuthenticated ? <Sidebar smeSearchEnabled={smeSearchEnabled} /> : null}
          <main>
            {isAuthenticated ? <AutomationStatusBar initialStatus={automationStatus} /> : null}
            {isAuthenticated && smeSearchEnabled ? <SmeScheduledSearchLocalTick /> : null}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
