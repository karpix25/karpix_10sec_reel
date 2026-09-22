import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-reference-presentation-"));
const require = createRequire(import.meta.url);

try {
  execFileSync(join(ui, "node_modules/.bin/tsc"), [
    "src/lib/server/omni/reference-presentation-mechanics.ts",
    "src/lib/server/omni/omni-intro-product-contract.ts",
    "--outDir", output,
    "--module", "commonjs",
    "--target", "es2022",
    "--skipLibCheck",
  ], { cwd: ui, stdio: "inherit" });

  const presentation = require(join(output, "reference-presentation-mechanics.js"));
  const product = require(join(output, "omni-intro-product-contract.js"));
  const reference = "Расскажите про самое ужасное место из путешествий. Давайте вместе почитаем эту ветку. Стамбул. Грязь и обман. Пхукет. Испорченная еда и мошенники.";

  assert.equal(presentation.detectReferencePresentationMechanic(reference), "comment_review");
  assert.match(presentation.renderReferencePresentationContract(reference), /минимум два конкретных комментария/u);
  assert.doesNotThrow(() => presentation.assertReferencePresentationPreserved(
    reference,
    "Вот что пишет турист про Стамбул. А здесь отзыв о Пхукете. Плати по миру помогает подготовить оплату заранее.",
  ));
  assert.throws(() => presentation.assertReferencePresentationPreserved(
    reference,
    "Один турист провел на курорте двадцать дней. Плати по миру помогает подготовить оплату заранее.",
  ), /обзор комментариев/u);
  assert.equal(product.mentionsNamedOmniProduct("разруху вместо красивой картинки", "Плати по миру виртуальная карта"), false);
  assert.equal(product.mentionsNamedOmniProduct("оформила виртуальную карту", "Плати по миру виртуальная карта"), true);

  console.log("Omni reference presentation checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
