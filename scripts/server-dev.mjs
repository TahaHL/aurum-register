import { spawn } from "node:child_process";
import { once } from "node:events";
const build = spawn(process.execPath, ["scripts/build-server.mjs"], {
  stdio: "inherit",
});
const [exitCode] = await once(build, "exit");
if (exitCode !== 0) process.exit(exitCode || 1);
const server = spawn(
  process.execPath,
  ["--env-file-if-exists=.env", "dist-server/server/index.js"],
  { stdio: "inherit" },
);
process.on("SIGINT", () => server.kill());
process.on("SIGTERM", () => server.kill());
server.on("exit", (code) => {
  process.exitCode = code || 0;
});
