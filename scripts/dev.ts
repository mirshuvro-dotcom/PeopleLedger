/**
 * `pnpm dev`: run the API (port 4000) and the developer console (port 3000)
 * together, with prefixed output. Ctrl+C stops both. Settings come from .env.
 */
import "./load-env.js";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
const children: ChildProcess[] = [];

function run(name: string, dir: string, color: number): void {
  const child = spawn("pnpm", ["--dir", dir, "dev"], { env, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const relay = (stream: NodeJS.WritableStream) => (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) stream.write(`${prefix}${line}\n`);
  };
  child.stdout?.on("data", relay(process.stdout));
  child.stderr?.on("data", relay(process.stderr));
  child.on("exit", (code) => {
    console.log(`${prefix}exited (${code ?? "signal"})`);
    stopAll(code ?? 0);
  });
}

let stopping = false;
function stopAll(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue;
    // On Windows, kill the whole process tree (pnpm -> node).
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

run("api", "apps/api", 36);
run("web", "apps/web", 35);
console.log("Developer console: http://localhost:3000   API: http://localhost:4000   (Ctrl+C to stop)");
