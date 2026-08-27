import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/load-actor";
import { originationResponse } from "@/lib/origination/http";
import { createServiceRoleClient } from "@/lib/auth/supabase/admin";
import { originationService } from "@/services/origination-service";

export async function GET(request: Request) {
  try {
    const actor = await requireActor();
    const url = new URL(request.url);
    const bucket = url.searchParams.get("bucket") ?? "";
    const path = url.searchParams.get("path") ?? "";
    if (!bucket || !path) {
      return NextResponse.json({ error: "validation" }, { status: 400 });
    }
    const blob = await originationService().authorizedBlob(actor, bucket, path);
    if (!blob) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const admin = createServiceRoleClient();
    if (admin) {
      const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60);
      if (!error && data?.signedUrl) {
        return NextResponse.redirect(data.signedUrl);
      }
    }
    return new NextResponse(Buffer.from(blob.bytes), {
      headers: {
        "Content-Type": blob.contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return originationResponse(error);
  }
}
