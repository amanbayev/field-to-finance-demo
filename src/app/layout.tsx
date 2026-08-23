import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Inter, Source_Serif_4 } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppChrome } from "@/components/layout/app-chrome";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { productName } from "@/lib/navigation";
import "./globals.css";

export const dynamic = "force-dynamic";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${ibmPlexSans.variable} ${sourceSerif.variable} ${ibmPlexMono.variable} ${inter.variable} h-full`}
    >
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TooltipProvider>
            <AppChrome header={<SiteHeader />} footer={<SiteFooter />}>
              {children}
            </AppChrome>
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
