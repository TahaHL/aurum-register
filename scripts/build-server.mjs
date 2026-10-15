import { spawnSync } from "node:child_process";
import { cp } from "node:fs/promises";
const result = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.server.json"],
  { stdio: "inherit" },
);
if (result.status !== 0) process.exit(result.status || 1);
await cp("server/migrations", "dist-server/server/migrations", {
  recursive: true,
});

await cp("server/seed", "dist-server/server/seed", { recursive: true });
