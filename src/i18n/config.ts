export const locales = ["kk", "ru", "en"] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "kk";

export const localeCookieName = "ftf-locale";

export const localeLabels: Record<AppLocale, string> = {
  kk: "ҚАЗ",
  ru: "РУС",
  en: "ENG",
};

export const intlLocales: Record<AppLocale, string> = {
  kk: "kk-KZ",
  ru: "ru-KZ",
  en: "en-US",
};

export function isAppLocale(value: string | undefined): value is AppLocale {
  return value === "kk" || value === "ru" || value === "en";
}
