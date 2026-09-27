import { spawnSync } from "node:child_process";

const runner = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(args) {
  const result = spawnSync(runner, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.env.VERCEL_ENV === "production") {
  run(["db:migrate"]);
  run(["db:seed"]);
}

run(["exec", "next", "build", "--webpack"]);
