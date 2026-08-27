import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { DeskFrame } from "@/components/surface/desk-frame";
import { getOptionalActor } from "@/lib/auth/load-actor";
import { navGroupsForActor } from "@/lib/auth/nav";
import { productName } from "@/lib/navigation";
import "./globals.css";

export const dynamic = "force-dynamic";

const geologica = localFont({
  src: "../fonts/Geologica-Variable.ttf",
  variable: "--font-geologica",
  weight: "100 900",
  display: "swap",
  adjustFontFallback: false,
});

const jetbrains = localFont({
  src: "../fonts/JetBrainsMono-Variable.ttf",
  variable: "--font-jetbrains",
  weight: "400 500",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: {
      default: t("metadata.defaultTitle"),
      template: `%s · ${productName}`,
    },
    description: t("brand.subtitle"),
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations("surface");
  const actor = await getOptionalActor().catch(() => null);
  const groups = navGroupsForActor(actor);

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${geologica.variable} ${jetbrains.variable} h-full`}
    >
      <body
        className={`${geologica.className} flex min-h-full flex-col overflow-x-hidden bg-background`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TooltipProvider>
            <a
              href="#content"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
            >
              {t("skipToContent")}
            </a>
            <SiteHeader />
            <main id="content" className={actor ? "min-w-0 w-full flex-1" : "surface-main flex-1"}>
              {actor ? <DeskFrame groups={groups}>{children}</DeskFrame> : children}
            </main>
            {actor ? null : <SiteFooter />}
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
