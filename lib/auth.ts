import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { createOpaqueToken, hashToken } from "@/lib/security";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function cookieName() {
  return process.env.SESSION_COOKIE_NAME ?? "pw_session";
}

export async function createSession(userId: string) {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS);
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), expiresAt });
  const store = await cookies();
  store.set(cookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSession() {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  if (token)
    await getDb()
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
  store.delete(cookieName());
}

export async function getCurrentUser() {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token) return null;
  const [row] = await getDb()
    .select({ id: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
