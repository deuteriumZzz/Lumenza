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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appearanceBootstrap = `
(() => {
  try {
    const storedTheme = localStorage.getItem("lumenza:theme");
    const preference = ["system", "dark", "light"].includes(storedTheme) ? storedTheme : "system";
    const theme = preference === "system"
      ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : preference;
    const storedAccent = localStorage.getItem("lumenza:accent");
    const accent = ["amber", "cyan", "green"].includes(storedAccent) ? storedAccent : "amber";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.accent = accent;
  } catch {}
})();
`;

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
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-ink">
        <ZoneProvider>
          <AppBackdrop>
            <TelegramWebAppProvider>
              <LocaleProvider>
                <GlobalHotkeys />
                <AuthProvider>
                  <AccessibilityShell navigation={<Nav />}>
                    <TelegramLinkExistingAccount />
                    <ZoneScope>
                      <WorkspaceShell>
                        <RouteTransition>{children}</RouteTransition>
                      </WorkspaceShell>
                    </ZoneScope>
                  </AccessibilityShell>
                </AuthProvider>
              </LocaleProvider>
            </TelegramWebAppProvider>
          </AppBackdrop>
        </ZoneProvider>
      </body>
    </html>
  );
}
