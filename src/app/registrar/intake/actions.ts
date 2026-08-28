"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OriginationError } from "@/domain/origination";
import { requireRegistrarIntake } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";

function bounce(dacId: string, error: unknown): never {
  if (error instanceof OriginationError) {
    redirect(`/registrar/intake/${dacId}?error=${encodeURIComponent(error.code)}`);
  }
  throw error;
}

export async function startRegistrarReviewAction(formData: FormData) {
  const actor = await requireRegistrarIntake();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().startRegistrarReview(actor, dacId);
    revalidatePath("/registrar/intake");
    revalidatePath("/contracts");
    revalidatePath(`/registrar/intake/${dacId}`);
  } catch (error) {
    bounce(dacId, error);
  }
}

export async function acceptDacIntakeAction(formData: FormData) {
  const actor = await requireRegistrarIntake();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().acceptDacIntake(actor, dacId, String(formData.get("notes") ?? ""));
    revalidatePath("/registrar/intake");
    revalidatePath("/contracts");
    revalidatePath(`/registrar/intake/${dacId}`);
  } catch (error) {
    bounce(dacId, error);
  }
}

export async function returnDacIntakeAction(formData: FormData) {
  const actor = await requireRegistrarIntake();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().returnDacIntake(actor, dacId, String(formData.get("notes") ?? ""));
    revalidatePath("/registrar/intake");
    revalidatePath("/scas/dacs");
    revalidatePath("/contracts");
    revalidatePath(`/registrar/intake/${dacId}`);
  } catch (error) {
    bounce(dacId, error);
  }
}

export async function sendRegistrarDacMessageAction(formData: FormData) {
  const actor = await requireRegistrarIntake();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().sendDacMessage(actor, dacId, String(formData.get("body") ?? ""));
    revalidatePath(`/registrar/intake/${dacId}`);
  } catch (error) {
    bounce(dacId, error);
  }
}
