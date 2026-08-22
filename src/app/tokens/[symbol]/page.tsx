import { redirect } from "next/navigation";
import { listTokens } from "@/services/token-service";

export const dynamicParams = false;

export function generateStaticParams() {
  return listTokens().map((token) => ({ symbol: token.symbol }));
}

export default async function TokenSymbolRedirect({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  redirect(`/instruments/${symbol}`);
}
