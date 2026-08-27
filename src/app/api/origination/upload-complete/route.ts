import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/load-actor";
import { originationResponse } from "@/lib/origination/http";
import { originationService } from "@/services/origination-service";

export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    const body = (await request.json()) as { uploadIntentId?: string };
    if (!body.uploadIntentId) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }
    const document = await originationService().commitDirectUpload(actor, {
      uploadIntentId: body.uploadIntentId,
    });
    return NextResponse.json({ document });
  } catch (error) {
    return originationResponse(error);
  }
}
