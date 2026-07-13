import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-cta-contract-"));
const require = createRequire(import.meta.url);

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/omni-cta-contract.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const { ensureOmniScriptCta } = require(join(output, "server/omni/omni-cta-contract.js"));
  const base = "Короткий сценарий о продукте и его пользе.";
  assert.equal(
    ensureOmniScriptCta(base, "article_in_description"),
    `${base} Артикул можно найти в описании.`
  );
  assert.equal(
    ensureOmniScriptCta(`${base} Артикул ищи в описании.`, "article_in_description"),
    `${base} Артикул ищи в описании.`
  );
  assert.equal(
    ensureOmniScriptCta(base, "keyword_in_comments", "ХОЧУ"),
    `${base} Напишите кодовое слово «ХОЧУ» в комментариях.`
  );
  assert.throws(
    () => ensureOmniScriptCta(`${base} Напиши слово ТЕСТ в комментариях.`, "article_in_description"),
    /конфликтует с режимом «артикул в описании»/u
  );
  console.log("Omni CTA contract regression checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
