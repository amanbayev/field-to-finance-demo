"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitSecondaryOrderAction } from "@/app/secondary/actions";

export function OrderEntry({
  canSubmit,
  availableQty,
  availableCash,
  eligibilityLabel,
  eligibilityValue,
  quantityLabel,
  priceLabel,
  estimatedLabel,
  availableAssetLabel,
  availableCashLabel,
  buyLabel,
  sellLabel,
  submitLabel,
  disclaimer,
  buyDisclosure,
}: {
  canSubmit: boolean;
  availableQty: number;
  availableCash: number;
  eligibilityLabel: string;
  eligibilityValue: string;
  quantityLabel: string;
  priceLabel: string;
  estimatedLabel: string;
  availableAssetLabel: string;
  availableCashLabel: string;
  buyLabel: string;
  sellLabel: string;
  submitLabel: string;
  disclaimer: string;
  buyDisclosure: React.ReactNode;
}) {
  const [side, setSide] = useState<"BUY" | "SELL">("SELL");
  const [quantity, setQuantity] = useState("2");
  const [price, setPrice] = useState("105000");
  const estimated = useMemo(() => {
    const qty = Number(quantity);
    const px = Number(price);
    if (!Number.isInteger(qty) || !Number.isInteger(px) || qty <= 0 || px <= 0) {
      return 0;
    }
    return qty * px;
  }, [quantity, price]);

  return (
    <form
      action={submitSecondaryOrderAction}
      className="grid gap-4"
      onSubmit={(event) => {
        const field = event.currentTarget.elements.namedItem("idempotencyKey");
        if (field instanceof HTMLInputElement && !field.value) {
          field.value = crypto.randomUUID();
        }
      }}
    >
      <input type="hidden" name="side" value={side} />
      <input type="hidden" name="idempotencyKey" defaultValue="" />
      <div className="flex gap-2">
        <Button
          type="button"
          variant={side === "BUY" ? "default" : "outline"}
          size="sm"
          onClick={() => setSide("BUY")}
        >
          {buyLabel}
        </Button>
        <Button
          type="button"
          variant={side === "SELL" ? "default" : "outline"}
          size="sm"
          onClick={() => setSide("SELL")}
        >
          {sellLabel}
        </Button>
      </div>
      <label className="grid gap-1 text-xs">
        {quantityLabel}
        <Input
          name="quantity"
          inputMode="numeric"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-xs">
        {priceLabel}
        <Input
          name="price"
          inputMode="numeric"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          required
        />
      </label>
      <p className="text-sm">
        {estimatedLabel}:{" "}
        <span className="font-medium font-tabular">{estimated.toLocaleString("en-US")} DEMO-KZT</span>
      </p>
      <p className="text-xs text-muted-foreground">{disclaimer}</p>
      <dl className="grid gap-1 text-xs">
        <div className="flex justify-between gap-3">
          <dt>{availableAssetLabel}</dt>
          <dd className="font-tabular">{availableQty}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{availableCashLabel}</dt>
          <dd className="font-tabular">{availableCash.toLocaleString("en-US")} DEMO-KZT</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{eligibilityLabel}</dt>
          <dd>{eligibilityValue}</dd>
        </div>
      </dl>
      {side === "BUY" ? buyDisclosure : null}
      <Button type="submit" disabled={!canSubmit} size="sm">
        {submitLabel}
      </Button>
    </form>
  );
}
