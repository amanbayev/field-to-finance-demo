import { NextResponse } from "next/server";
import { FIELD_DOCUMENT_TYPES, type FieldDocumentType } from "@/domain/origination";
import { requireActor } from "@/lib/auth/load-actor";
import { originationResponse } from "@/lib/origination/http";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";
import { originationService, originationUsesObjectStorage } from "@/services/origination-service";

export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    const body = (await request.json()) as {
      fieldId?: string;
      documentType?: string;
      filename?: string;
      mimeType?: string;
      sizeBytes?: number;
      replacesDocumentId?: string | null;
    };
    if (
      !body.fieldId ||
      !body.filename ||
      !body.mimeType ||
      !body.sizeBytes ||
      !FIELD_DOCUMENT_TYPES.includes(body.documentType as FieldDocumentType)
    ) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }
    const prepared = await originationService().prepareDirectUpload(actor, {
      fieldId: body.fieldId,
      documentType: body.documentType as FieldDocumentType,
      filename: body.filename,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      replacesDocumentId: body.replacesDocumentId,
    });
    if (!originationUsesObjectStorage()) {
      return NextResponse.json({ mode: "local", ...prepared });
    }
    const admin = createServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ mode: "local", ...prepared });
    }
    const { data, error } = await admin.storage
      .from(prepared.bucket)
      .createSignedUploadUrl(prepared.objectPath);
    if (error || !data) {
      return NextResponse.json({ error: "storage", message: error?.message }, { status: 500 });
    }
    return NextResponse.json({
      mode: "signed",
      ...prepared,
      token: data.token,
      signedUrl: data.signedUrl,
    });
  } catch (error) {
    return originationResponse(error);
  }
}
