import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security";
import { loginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await assertSameOrigin(request);
    const input = loginSchema.parse(await request.json());
    const [user] = await getDb().select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!user || !(await compare(input.password, user.passwordHash))) {
      return NextResponse.json(
        { error: "メールアドレスまたはパスワードが正しくありません" },
        { status: 401 },
      );
    }
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "ログインできませんでした");
  }
}
