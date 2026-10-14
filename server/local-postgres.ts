import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
// Development/test bootstrap only. Windows uses PostgreSQL's native tools directly,
// avoiding an unnecessary POSIX user lookup in the embedded-postgres wrapper.
export async function startLocalPostgres(options: {
  directory: string;
  port: number;
  user: string;
  password: string;
}) {
  if (
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65535
  )
    throw Error("Invalid local database port");
  if (process.platform !== "win32") {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const instance = new EmbeddedPostgres({
      databaseDir: options.directory,
      port: options.port,
      user: options.user,
      password: options.password,
      persistent: true,
      postgresFlags: ["-h", "127.0.0.1"],
      onLog: () => {},
      onError: (x) => console.error(String(x)),
    });
    await instance.initialise();
    await instance.start();
    return { stop: () => instance.stop() };
  }
  const require = createRequire(import.meta.url),
    binaryDir = path.resolve(
      path.dirname(require.resolve("@embedded-postgres/windows-x64")),
      "../native/bin",
    );
  async function command(binary: string, args: string[]) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(path.join(binaryDir, binary), args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (x) => (output += x));
      child.stderr.on("data", (x) => (output += x));
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              Error(
                `Local PostgreSQL ${binary} failed: ${output.slice(-1500)}`,
              ),
            ),
      );
    });
  }
  await fs.mkdir(path.dirname(options.directory), { recursive: true });
  if (
    !(await fs
      .stat(path.join(options.directory, "PG_VERSION"))
      .then(() => true)
      .catch(() => false))
  ) {
    const passwordFile = path.join(
      path.dirname(options.directory),
      ".pg-password-" + randomUUID(),
    );
    await fs.writeFile(passwordFile, options.password + "\n", { mode: 0o600 });
    try {
      await command("initdb.exe", [
        "-D",
        options.directory,
        "-U",
        options.user,
        "--pwfile",
        passwordFile,
        "--auth=scram-sha-256",
        "--encoding=UTF8",
        "--locale=C",
      ]);
    } finally {
      await fs.unlink(passwordFile);
    }
  }
  await command("pg_ctl.exe", [
    "start",
    "-D",
    options.directory,
    "-l",
    path.join(options.directory, "server.log"),
    "-o",
    `-p ${options.port} -h 127.0.0.1`,
    "-w",
    "-t",
    "30",
  ]);
  return {
    stop: () =>
      command("pg_ctl.exe", [
        "stop",
        "-D",
        options.directory,
        "-m",
        "fast",
        "-w",
        "-t",
        "30",
      ]),
  };
}
