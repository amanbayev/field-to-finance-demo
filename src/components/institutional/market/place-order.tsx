"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { submitUiV2SecondaryOrderAction } from "@/app/ui-v2/markets/actions";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { cn } from "@/lib/utils";

const SIZE_CHIPS = [10, 25, 50, 100] as const;

function Stepper({
  label,
  name,
  value,
  onChange,
  suffix,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  suffix?: string;
  disabled?: boolean;
}) {
  function step(delta: number) {
    const current = Number(value);
    const next = Number.isInteger(current) ? Math.max(0, current + delta) : 0;
    onChange(String(next));
  }

  return (
    <label className="grid gap-1 text-[11px] text-[#59645D]">
      {label}
      <div className="flex h-9 items-center overflow-hidden rounded-md border border-border bg-background">
        <button
          type="button"
          disabled={disabled}
          onClick={() => step(-1)}
          className="flex size-9 shrink-0 items-center justify-center text-[#59645D] hover:bg-[#F1F4F1] disabled:opacity-40"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-3.5" />
        </button>
        <input
          name={name}
          inputMode="numeric"
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-center text-sm font-medium tabular-nums outline-none disabled:opacity-60"
          required
        />
        {suffix ? (
          <span className="pr-1 text-[10px] tracking-wide text-[#7B857F]">{suffix}</span>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={() => step(1)}
          className="flex size-9 shrink-0 items-center justify-center text-[#59645D] hover:bg-[#F1F4F1] disabled:opacity-40"
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </label>
  );
}

export function PlaceOrder({
  marketId,
  canSubmit,
  reviewMode,
  lastPrice,
  availableQty,
  availableCash,
  locale,
  labels,
}: {
  marketId: string;
  canSubmit: boolean;
  reviewMode: boolean;
  lastPrice: number | null;
  availableQty: number;
  availableCash: number;
  locale: AppLocale;
  labels: {
    buy: string;
    sell: string;
    limitOrder: string;
    price: string;
    size: string;
    tokens: string;
    max: string;
    orderValue: string;
    timeInForce: string;
    untilFilled: string;
    placeBuy: string;
    placeSell: string;
    available: string;
    viewOnly: string;
    noMonetaryValue: string;
  };
}) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState(lastPrice ? String(lastPrice) : "");
  const [size, setSize] = useState("1");
  const disabled = reviewMode || !canSubmit;
  const estimated = useMemo(() => {
    const qty = Number(size);
    const px = Number(price);
    if (!Number.isInteger(qty) || !Number.isInteger(px) || qty <= 0 || px <= 0) {
      return 0;
    }
    return qty * px;
  }, [size, price]);

  function setMax() {
    if (side === "SELL") {
      setSize(String(Math.max(0, availableQty)));
      return;
    }
    const px = Number(price);
    if (!Number.isInteger(px) || px <= 0) {
      setSize("0");
      return;
    }
    setSize(String(Math.floor(availableCash / px)));
  }

  const body = (
    <>
      <input type="hidden" name="marketId" value={marketId} />
      <input type="hidden" name="side" value={side} />
      <input type="hidden" name="idempotencyKey" defaultValue="" />
      <div className="grid grid-cols-2 gap-1 rounded-md bg-[#F1F4F1] p-0.5">
        <button
          type="button"
          onClick={() => setSide("BUY")}
          className={cn(
            "h-8 rounded-[5px] text-[12px] font-medium",
            side === "BUY" ? "bg-[#0B5D3B] text-white" : "text-[#59645D] hover:text-foreground",
          )}
        >
          {labels.buy}
        </button>
        <button
          type="button"
          onClick={() => setSide("SELL")}
          className={cn(
            "h-8 rounded-[5px] text-[12px] font-medium",
            side === "SELL" ? "bg-red-700 text-white" : "text-[#59645D] hover:text-foreground",
          )}
        >
          {labels.sell}
        </button>
      </div>
      <div className="flex h-9 items-center justify-between rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground">
        <span>{labels.limitOrder}</span>
        <span className="text-[10px] tracking-wide text-[#7B857F]">LIMIT</span>
      </div>
      <Stepper
        label={labels.price}
        name="price"
        value={price}
        onChange={setPrice}
        suffix="DEMO-KZT"
        disabled={disabled}
      />
      <Stepper
        label={labels.size}
        name="quantity"
        value={size}
        onChange={setSize}
        suffix={labels.tokens}
        disabled={disabled}
      />
      <div className="flex flex-wrap gap-1">
        {SIZE_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={disabled}
            onClick={() => setSize(String(chip))}
            className="h-6 rounded-md border border-border px-2 text-[11px] text-[#59645D] hover:bg-[#F1F4F1] disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={setMax}
          className="h-6 rounded-md border border-border px-2 text-[11px] font-medium text-[#0B5D3B] hover:bg-[#EAF4EE] disabled:opacity-40"
        >
          {labels.max}
        </button>
      </div>
      <dl className="space-y-1 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="shrink-0 text-[#59645D]">{labels.orderValue}</dt>
          <dd className="truncate text-right tabular-nums font-medium">
            {formatInteger(estimated, locale)} DEMO-KZT
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="shrink-0 text-[#59645D]">{labels.timeInForce}</dt>
          <dd className="truncate text-right">{labels.untilFilled}</dd>
        </div>
      </dl>
      <button
        type={reviewMode ? "button" : "submit"}
        disabled={disabled}
        className={cn(
          "h-9 w-full rounded-md text-[13px] font-medium text-white disabled:opacity-40",
          side === "BUY" ? "bg-[#0B5D3B] hover:bg-[#084A30]" : "bg-red-700 hover:bg-red-800",
        )}
      >
        {side === "BUY" ? labels.placeBuy : labels.placeSell}
      </button>
      <p className="text-[11px] leading-snug text-[#7B857F]">
        {labels.available}:{" "}
        <span className="tabular-nums font-medium text-foreground">
          {side === "BUY"
            ? `${formatInteger(availableCash, locale)} DEMO-KZT`
            : `${availableQty} ${labels.tokens}`}
        </span>
        {disabled ? ` · ${labels.viewOnly}` : null}
        {` · ${labels.noMonetaryValue}`}
      </p>
    </>
  );

  if (reviewMode) {
    return <div className="grid gap-2">{body}</div>;
  }

  return (
    <form
      action={submitUiV2SecondaryOrderAction}
      className="grid gap-2"
      onSubmit={(event) => {
        const field = event.currentTarget.elements.namedItem("idempotencyKey");
        if (field instanceof HTMLInputElement && !field.value) {
          field.value = crypto.randomUUID();
        }
      }}
    >
      {body}
    </form>
  );
}
