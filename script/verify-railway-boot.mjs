/**
 * Regression: Railway 404s when Stripe/Postgres init blocks listen().
 * Spawn the production bundle with an unreachable DATABASE_URL and require
 * /health within a few seconds (not after the 15s pg connection timeout).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(root, "dist", "index.cjs");

if (!existsSync(distEntry)) {
  console.error("verify-railway-boot: missing dist/index.cjs — run npm run build first");
  process.exit(1);
}

const port = Number(process.env.VERIFY_RAILWAY_PORT || 57100 + Math.floor(Math.random() * 800));
const base = `http://127.0.0.1:${port}`;
const maxMs = Number(process.env.VERIFY_RAILWAY_MAX_MS || 4000);

const child = spawn(process.execPath, [distEntry], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "production",
    // Black-hole Postgres so runMigrations / pool.connect hang like a bad Railway DATABASE_URL.
    DATABASE_URL: "postgresql://railway:railway@127.0.0.1:1/equilibrium",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderrBuf = "";
child.stderr?.on("data", (c) => {
  stderrBuf += String(c);
  if (stderrBuf.length > 4000) stderrBuf = stderrBuf.slice(-2000);
});

function stopChild() {
  if (child.exitCode !== null || child.signalCode) return;
  try {
    child.kill(process.platform === "win32" ? undefined : "SIGTERM");
  } catch {
    /* ignore */
  }
}

const started = Date.now();
let ok = false;

try {
  while (Date.now() - started < maxMs) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) {
        const body = await r.json();
        if (body.status !== "ok") {
          throw new Error(`/health body: ${JSON.stringify(body)}`);
        }
        ok = true;
        const ms = Date.now() - started;
        console.log(`verify-railway-boot: ✓ GET /health in ${ms}ms with unreachable DATABASE_URL`);
        break;
      }
    } catch (e) {
      if (String(e?.message || e).startsWith("/health body")) throw e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!ok) {
    throw new Error(
      `server did not respond on /health within ${maxMs}ms while DATABASE_URL was unreachable`,
    );
  }
  process.exitCode = 0;
} catch (e) {
  console.error("verify-railway-boot: FAILED —", e?.message || e);
  if (stderrBuf.trim()) console.error("--- server stderr (tail) ---\n", stderrBuf.slice(-2000));
  process.exitCode = 1;
} finally {
  stopChild();
  await new Promise((r) => setTimeout(r, 400));
}
process.exit(process.exitCode ?? 1);
