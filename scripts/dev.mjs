import { spawn } from "node:child_process";
const children = [
  spawn(
    process.execPath,
    ["--env-file-if-exists=.env", "scripts/server-dev.mjs"],
    { stdio: "inherit" },
  ),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
    env: process.env,
  }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill());
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => {
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stop();
  });
  child.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code || 1;
      stop();
    }
  });
});
