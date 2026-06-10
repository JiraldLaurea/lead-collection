import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AutomationStatusBar } from "@/components/AutomationStatusBar";
import { Sidebar } from "@/components/Sidebar";
import { isAdminAuthenticated } from "@/lib/auth";
import { getAutomationStatus } from "@/lib/auto-email";
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
  const isAuthenticated = await isAdminAuthenticated();
  const automationStatus = isAuthenticated ? await getAutomationStatus() : null;

  return (
    <html lang="en">
      <body className={inter.className}>
        <div className={isAuthenticated ? "app-shell" : "app-shell app-shell-public"}>
          {isAuthenticated ? <Sidebar /> : null}
          <main>
            {isAuthenticated ? <AutomationStatusBar initialStatus={automationStatus} /> : null}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
