import { spawn } from "node:child_process";

const apiPort = process.env.API_PORT || process.env.PORT || "4000";
const uiPort = process.env.VITE_PORT || "5173";
const nodeBin = process.execPath;
const localEnv = {
  PORT: apiPort,
  API_PORT: apiPort,
  DEMO_MODE: process.env.DEMO_MODE || "true",
};

const children = [];

function start(name, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, ...env },
    shell: false,
  });

  children.push(child);

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`[${name}] exited with ${signal || code}`);
    shutdown(code || 1);
  });

  return child;
}

let shuttingDown = false;

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`Starting ProofPilot locally`);
console.log(`API: http://localhost:${apiPort}`);
console.log(`UI:  http://localhost:${uiPort}`);

start("api", nodeBin, ["server/index.js"], localEnv);
start("ui", nodeBin, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", uiPort], localEnv);
