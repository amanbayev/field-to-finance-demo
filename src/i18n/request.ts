import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  defaultLocale,
  isAppLocale,
  localeCookieName,
  type AppLocale,
} from "./config";
import { mergeMessages } from "./merge-messages";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import kk from "../../messages/kk.json";

const catalogs: Record<AppLocale, typeof en> = {
  en,
  ru: ru as unknown as typeof en,
  kk: kk as unknown as typeof en,
};

export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(localeCookieName)?.value;
  const locale = isAppLocale(requested) ? requested : defaultLocale;
  const messages = locale === "en" ? en : mergeMessages(en, catalogs[locale]);

  return {
    locale,
    messages,
  };
});
