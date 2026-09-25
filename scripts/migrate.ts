import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL を設定してください");

const sql = postgres(url, { max: 1, prepare: false });
await sql`CREATE TABLE IF NOT EXISTS app_migrations (
  name text PRIMARY KEY,
  applied_at timestamp with time zone DEFAULT now() NOT NULL
)`;

const migrationDir = resolve("drizzle");
const files = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
for (const name of files) {
  const [applied] = await sql`SELECT name FROM app_migrations WHERE name = ${name}`;
  if (applied) continue;
  const source = await readFile(resolve(migrationDir, name), "utf8");
  const statements = source
    .split("--> statement-breakpoint")
    .map((value) => value.trim())
    .filter(Boolean);
  await sql.begin(async (transaction) => {
    for (const statement of statements) await transaction.unsafe(statement);
    await transaction`INSERT INTO app_migrations (name) VALUES (${name})`;
  });
  console.log(`Applied ${name}`);
}
await sql.end();
