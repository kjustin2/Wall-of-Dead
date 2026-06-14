// End-of-turn guard, invoked by the Stop hook in .claude/settings.json (the hook
// references this filename, so we keep it). Since the Three.js/Vite/TS rebuild,
// the cheap regression net is a strict typecheck rather than the old Canvas2D
// smoke test. Runs the locally-installed tsc --noEmit and propagates its exit
// code. No-ops gracefully before `npm install` has run.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const tsc = join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc"
);

if (!existsSync(tsc)) {
  console.log("check-imports: typescript not installed yet — skipping typecheck.");
  process.exit(0);
}

const res = spawnSync(tsc, ["--noEmit"], { cwd: root, stdio: "inherit", shell: false });
process.exit(res.status ?? 1);
