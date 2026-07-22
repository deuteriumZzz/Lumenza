import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { Nav } from "@/components/nav";
import { ZoneScope } from "@/components/zone";
import { AccessibilityShell } from "@/components/accessibility-shell";
import { TelegramWebAppProvider } from "@/components/telegram-webapp-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lumenza",
  description: "AI workspace for content creators — chat, images, and content plans.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <TelegramWebAppProvider />
        <AuthProvider>
          <AccessibilityShell navigation={<Nav />}>
            <ZoneScope>{children}</ZoneScope>
          </AccessibilityShell>
        </AuthProvider>
      </body>
    </html>
  );
}
