import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "../lib/db/schema";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error("ADMIN_EMAIL と12文字以上の ADMIN_PASSWORD を設定してください");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL を設定してください");

  const client = postgres(url, { max: 1, prepare: false });
  try {
    const db = drizzle(client);
    const passwordHash = await hash(password, 12);
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) {
      await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
      console.log("管理者のパスワードを更新しました");
    } else {
      await db.insert(users).values({ email, passwordHash });
      console.log("管理者を作成しました");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
