import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, "ui/src/lib/server/omni/omni-speech-quality.ts");
const output = mkdtempSync(join(tmpdir(), "omni-speech-quality-"));

try {
  execFileSync(join(root, "ui/node_modules/.bin/tsc"), [
    source,
    "--target", "es2022",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--outDir", output,
    "--skipLibCheck",
  ], { cwd: join(root, "ui"), stdio: "inherit" });
  const compiled = readFileSync(join(output, "omni-speech-quality.js"), "utf8");
  const module = { exports: {} };
  Function("module", "exports", compiled)(module, module.exports);
  const { assessOmniSpeechQuality, assertOmniSpeechQuality } = module.exports;

  assert.equal(assessOmniSpeechQuality(
    "Кажется, мир стал меньше. Но это не так.",
    "Кажется, мир стал меньше, два меньше. Но это не так."
  ).passed, false);
  assert.deepEqual(assessOmniSpeechQuality(
    "Кажется, мир стал меньше. Но это не так.",
    "Кажется, мир стал меньше, два меньше. Но это не так."
  ).duplicateWords, ["меньше"]);
  assert.equal(assessOmniSpeechQuality(
    "Плати по миру. Ссылка в профиле.",
    "Плати по миру. Плати по миру. Ссылка в профиле."
  ).passed, false);
  assert.doesNotThrow(() => assertOmniSpeechQuality(
    "Есть виртуальная карта. С ней легко платить за границей.",
    "Есть виртуальная карта. С ней легко платить за границей."
  ));
  console.log("Omni speech quality contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
