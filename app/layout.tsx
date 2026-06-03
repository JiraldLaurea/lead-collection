import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { isAdminAuthenticated } from "@/lib/auth";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata: Metadata = {
  title: "Office LAN Lead Collection",
  description: "Internal Google Places lead collection MVP"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isAuthenticated = await isAdminAuthenticated();

  return (
    <html lang="en">
      <body className={inter.className}>
        <div className={isAuthenticated ? "app-shell" : "app-shell app-shell-public"}>
          {isAuthenticated ? <Sidebar /> : null}
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
