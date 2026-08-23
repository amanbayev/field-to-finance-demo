"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/guard";
import {
  cancelSecondaryOrder,
  submitSecondaryOrder,
} from "@/services/secondary-market-service";

function refreshMarketPaths() {
  revalidatePath("/secondary");
  revalidatePath("/clearing");
  revalidatePath("/registry");
  revalidatePath("/audit");
  revalidatePath("/supervision");
  revalidatePath("/instruments/WHEAT-2027");
}

export async function submitSecondaryOrderAction(formData: FormData) {
  const actor = await requirePermission("market.trade");
  const side = String(formData.get("side") ?? "");
  const quantity = Number(formData.get("quantity"));
  const price = Number(formData.get("price"));
  if (side !== "BUY" && side !== "SELL") {
    redirect("/secondary?error=INVALID_QUANTITY");
  }
  const result = await submitSecondaryOrder({
    actor,
    side,
    quantity,
    price,
  });
  refreshMarketPaths();
  if (result.error) {
    redirect(`/secondary?error=${result.error}`);
  }
  redirect("/secondary?submitted=1");
}

export async function cancelSecondaryOrderAction(formData: FormData) {
  const actor = await requirePermission("market.trade");
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) {
    redirect("/secondary?error=ORDER_NOT_FOUND");
  }
  const result = await cancelSecondaryOrder({ actor, orderId });
  refreshMarketPaths();
  if (result.error) {
    redirect(`/secondary?error=${result.error}`);
  }
  redirect("/secondary?cancelled=1");
}
