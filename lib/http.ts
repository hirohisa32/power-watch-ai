import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(
  error: unknown,
  fallback = "処理を完了できませんでした。時間をおいて再度お試しください。",
) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "入力内容を確認してください" },
      { status: 400 },
    );
  if (error instanceof Error && error.name === "StoryboardValidationError")
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof Error && error.name === "GenerationRequestError")
    return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && error.message === "INVALID_ORIGIN")
    return NextResponse.json({ error: "リクエストを確認できませんでした" }, { status: 403 });
  console.error("API request failed", {
    error: error instanceof Error ? error.message : "unknown",
  });
  return NextResponse.json({ error: fallback }, { status: 500 });
}
