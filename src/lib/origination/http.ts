import { NextResponse } from "next/server";
import { AuthorizationError } from "@/domain/identity";
import { OriginationError } from "@/domain/origination";

export function originationResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    const status = error.code === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: error.code }, { status });
  }
  if (error instanceof OriginationError) {
    const status =
      error.code === "forbidden"
        ? 403
        : error.code === "not_found"
          ? 404
          : error.code === "validation" || error.code === "invalid_state" || error.code === "immutable"
            ? 400
            : 500;
    return NextResponse.json({ error: error.code, message: error.message }, { status });
  }
  throw error;
}
