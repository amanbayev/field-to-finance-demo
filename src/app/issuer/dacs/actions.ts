"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OriginationError } from "@/domain/origination";
import { requireIssuerOperator } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";

function bounce(dacId: string, error: unknown): never {
  if (error instanceof OriginationError) {
    redirect(`/issuer/dacs/${dacId}?error=${encodeURIComponent(error.code)}`);
  }
  throw error;
}

export async function confirmIssuerDacAction(formData: FormData) {
  const actor = await requireIssuerOperator();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().confirmDacAsIssuer(actor, dacId);
    revalidatePath("/issuer/dacs");
    revalidatePath("/scas/dacs");
    revalidatePath("/contracts");
    revalidatePath(`/issuer/dacs/${dacId}`);
  } catch (error) {
    bounce(dacId, error);
  }
}

export async function returnIssuerDacAction(formData: FormData) {
  const actor = await requireIssuerOperator();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().returnDacAsIssuer(actor, dacId, String(formData.get("reason") ?? ""));
    revalidatePath("/issuer/dacs");
    revalidatePath("/scas/dacs");
    revalidatePath(`/issuer/dacs/${dacId}`);
  } catch (error) {
    bounce(dacId, error);
  }
}
