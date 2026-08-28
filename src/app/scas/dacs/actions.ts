"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { OriginationError } from "@/domain/origination";
import { requireScasVerifier } from "@/lib/auth/guard";
import { originationService } from "@/services/origination-service";

function bounce(path: string, error: unknown): never {
  if (error instanceof OriginationError) {
    redirect(`${path}?error=${encodeURIComponent(error.code)}`);
  }
  throw error;
}

export async function createDacAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const caseId = String(formData.get("caseId") ?? "");
  try {
    const dac = await originationService().createDacFromVerifiedCase(actor, caseId);
    revalidatePath("/scas/dacs");
    revalidatePath("/contracts");
    revalidatePath(`/scas/verification/${caseId}`);
    if (dac.producerReference) {
      revalidatePath(`/fields/${dac.producerReference}`);
    }
    redirect(`/scas/dacs/${dac.publicId}`);
  } catch (error) {
    bounce(`/scas/verification/${caseId}`, error);
  }
}

export async function updateDacAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const dacId = String(formData.get("dacId") ?? "");
  const volume = String(formData.get("contractedVolumeTonnes") ?? "").trim();
  try {
    await originationService().updateDacDraft(actor, dacId, {
      crop: String(formData.get("crop") ?? ""),
      harvestYear: Number(formData.get("harvestYear") ?? 0),
      contractedVolumeTonnes: volume ? Number(volume) : null,
      qualityClass: String(formData.get("qualityClass") ?? "") || null,
      producerReference: String(formData.get("producerReference") ?? "") || null,
      deliveryStartDate: String(formData.get("deliveryStartDate") ?? "") || null,
      deliveryEndDate: String(formData.get("deliveryEndDate") ?? "") || null,
      deliveryLocation: String(formData.get("deliveryLocation") ?? "") || null,
      scasNotes: String(formData.get("scasNotes") ?? ""),
      issuerOrganizationId: String(formData.get("issuerOrganizationId") ?? "") || null,
    });
    revalidatePath(`/scas/dacs/${dacId}`);
    revalidatePath("/contracts");
  } catch (error) {
    bounce(`/scas/dacs/${dacId}`, error);
  }
}

export async function sendDacToProducerAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().sendDacToProducer(actor, dacId);
    revalidatePath("/scas/dacs");
    revalidatePath("/issuer/dacs");
    revalidatePath("/contracts");
    revalidatePath(`/scas/dacs/${dacId}`);
  } catch (error) {
    bounce(`/scas/dacs/${dacId}`, error);
  }
}

export async function submitDacAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().submitDacToRegistrar(actor, dacId);
    revalidatePath("/scas/dacs");
    revalidatePath("/registrar/intake");
    revalidatePath("/contracts");
    revalidatePath(`/scas/dacs/${dacId}`);
  } catch (error) {
    bounce(`/scas/dacs/${dacId}`, error);
  }
}

export async function sendDacMessageAction(formData: FormData) {
  const actor = await requireScasVerifier();
  const dacId = String(formData.get("dacId") ?? "");
  try {
    await originationService().sendDacMessage(actor, dacId, String(formData.get("body") ?? ""));
    revalidatePath(`/scas/dacs/${dacId}`);
  } catch (error) {
    bounce(`/scas/dacs/${dacId}`, error);
  }
}
