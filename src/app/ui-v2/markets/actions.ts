"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isLiveOrder } from "@/domain/market-core";
import { requirePermission } from "@/lib/auth/guard";
import {
  cancelSecondaryOrder,
  getSecondaryMarketView,
  submitSecondaryOrder,
} from "@/services/secondary-market-service";

function marketPath(marketId: string) {
  return `/ui-v2/markets/${marketId}`;
}

function refresh(marketId: string) {
  revalidatePath(marketPath(marketId));
  revalidatePath("/secondary");
  revalidatePath("/clearing");
  revalidatePath("/registry");
  revalidatePath("/audit");
  revalidatePath("/supervision");
  revalidatePath("/instruments/WHEAT-2027");
  revalidatePath("/ui-v2/instruments/WHEAT-2027");
}

function resolveMarketId(formData: FormData) {
  const marketId = String(formData.get("marketId") ?? "MKT-WHEAT-2027-DEMO-KZT");
  return marketId || "MKT-WHEAT-2027-DEMO-KZT";
}

export async function submitUiV2SecondaryOrderAction(formData: FormData) {
  const actor = await requirePermission("market.trade");
  const marketId = resolveMarketId(formData);
  const side = String(formData.get("side") ?? "");
  const quantity = Number(formData.get("quantity"));
  const price = Number(formData.get("price"));
  if (side !== "BUY" && side !== "SELL") {
    redirect(`${marketPath(marketId)}?error=1`);
  }
  const result = await submitSecondaryOrder({
    actor,
    side,
    quantity,
    price,
    idempotencyKey: String(formData.get("idempotencyKey") || crypto.randomUUID()),
  });
  refresh(marketId);
  if (result.error) {
    redirect(`${marketPath(marketId)}?error=1`);
  }
  redirect(`${marketPath(marketId)}?submitted=1`);
}

export async function cancelUiV2SecondaryOrderAction(formData: FormData) {
  const actor = await requirePermission("market.trade");
  const marketId = resolveMarketId(formData);
  const cancelAll = String(formData.get("cancelAll") ?? "") === "1";
  if (cancelAll) {
    const view = await getSecondaryMarketView(actor);
    const live = view.myOrders.filter(
      (order) =>
        isLiveOrder(order) &&
        (!view.participantId || order.participantId === view.participantId),
    );
    for (const order of live) {
      await cancelSecondaryOrder({
        actor,
        orderId: order.id,
        idempotencyKey: crypto.randomUUID(),
      });
    }
    refresh(marketId);
    redirect(`${marketPath(marketId)}?cancelled=1`);
  }
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) {
    redirect(`${marketPath(marketId)}?error=1`);
  }
  const result = await cancelSecondaryOrder({
    actor,
    orderId,
    idempotencyKey: String(formData.get("idempotencyKey") || crypto.randomUUID()),
  });
  refresh(marketId);
  if (result.error) {
    redirect(`${marketPath(marketId)}?error=1`);
  }
  redirect(`${marketPath(marketId)}?cancelled=1`);
}
