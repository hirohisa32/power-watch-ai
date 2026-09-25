import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    await deleteSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
