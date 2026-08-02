import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { Nav } from "@/components/nav";
import { ZoneProvider, ZoneScope } from "@/components/zone";
import { AccessibilityShell } from "@/components/accessibility-shell";
import { TelegramWebAppProvider } from "@/components/telegram-webapp-provider";
import { TelegramLinkExistingAccount } from "@/components/telegram-link-existing-account";
import { GlobalHotkeys } from "@/components/global-hotkeys";
import { RouteTransition } from "@/components/route-transition";
import { AppBackdrop } from "@/components/app-backdrop";
import { WorkspaceShell } from "@/components/workspace-shell";
import { LocaleProvider } from "@/lib/locale-context";
import { PetActivityProvider } from "@/lib/pet-activity";

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
  description:
    "AI-агрегатор для работы с ведущими моделями: чат, поиск, изображения, голос и документы.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <ZoneProvider>
          <AppBackdrop>
            <TelegramWebAppProvider>
              <LocaleProvider>
                <GlobalHotkeys />
                <AuthProvider>
                  <PetActivityProvider>
                    <AccessibilityShell navigation={<Nav />}>
                      <TelegramLinkExistingAccount />
                      <ZoneScope>
                        <WorkspaceShell>
                          <RouteTransition>{children}</RouteTransition>
                        </WorkspaceShell>
                      </ZoneScope>
                    </AccessibilityShell>
                  </PetActivityProvider>
                </AuthProvider>
              </LocaleProvider>
            </TelegramWebAppProvider>
          </AppBackdrop>
        </ZoneProvider>
      </body>
    </html>
  );
}
