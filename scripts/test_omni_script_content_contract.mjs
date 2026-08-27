import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-script-content-"));
const require = createRequire(import.meta.url);

function findFile(base, filename) {
  const queue = [base];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      if (entry.isFile() && entry.name === filename) return fullPath;
    }
  }
  throw new Error(`File ${filename} not found in ${base}`);
}

try {
  execFileSync(join(ui, "node_modules/.bin/tsc"), [
    join(ui, "src/lib/server/omni/script-content-contract.ts"),
    join(ui, "src/lib/server/omni/script-content-adapter-prompt.ts"),
    "--outDir", output,
    "--module", "commonjs",
    "--target", "es2022",
    "--skipLibCheck",
  ], { cwd: ui, stdio: "inherit" });

  const contract = require(findFile(output, "script-content-contract.js"));
  const adapterPrompt = require(findFile(output, "script-content-adapter-prompt.js"));
  const normalized = contract.normalizeScriptContentContract({
    source_meaning: {
      hook: "Как оплатить поездку без лишних сложностей?",
      main_question: "Как оплачивать услуги за границей?",
      answer_or_mechanism: "Нужен способ оплаты, который работает для зарубежных покупок.",
      required_points: ["жилье", "транспорт"],
      proof_examples: ["оплата бронирования"],
      conclusion: "Подготовка оплаты снимает лишнюю тревогу в поездке.",
    },
    adaptation: {
      version: "script-adaptation-v1",
      mode: "adjacent_bridge",
      reason: "Reference рассказывает о бесплатном жилье, продукт решает соседнюю платежную задачу.",
      preserve: ["история о бесплатном жилье", "ответ на исходный вопрос"],
      replace: ["способ оплаты жилья"],
      product_bridge: "После ответа на вопрос показать оплату остальных расходов картой.",
    },
  });
  assert.ok(normalized);
  const rendered = contract.renderScriptContentContract(normalized);
  assert.match(rendered, /бесплатном жилье/u);
  assert.match(rendered, /оплату остальных расходов картой/u);
  assert.match(rendered, /Смысловые пункты проверяй по значению/u);

  const incompatible = new contract.IncompatibleReferenceError({
    ...normalized,
    adaptation: { ...normalized.adaptation, mode: "incompatible", reason: "Честной связи нет." },
  });
  assert.match(incompatible.message, /нельзя честно адаптировать/u);

  const prompt = adapterPrompt.buildScriptContentAdapterPrompt({
    transcript: "Я неделю жил бесплатно.",
    title: "Как не платить за отель",
    topic: "Путешествия",
    productName: "Плати по миру",
    productDescription: "Виртуальная карта для оплаты за границей.",
    productReferenceNotes: null,
  });
  assert.match(prompt, /source_meaning/u);
  assert.match(prompt, /incompatible/u);
  assert.match(adapterPrompt.SCRIPT_CONTENT_ADAPTER_SYSTEM_PROMPT, /Не раскрывай цепочку размышлений/u);

  console.log("Omni script content contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
