import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-script-content-adapter-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);
const originalFetch = global.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      baseUrl: join(ui, "src"),
      paths: { "@/*": ["*"] },
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/omni/openrouter-cost.ts"),
      join(ui, "src/lib/server/omni/openrouter-pricing.ts"),
      join(ui, "src/lib/server/omni/reference-meaning-contract.ts"),
      join(ui, "src/lib/server/omni/script-adaptation-contract.ts"),
      join(ui, "src/lib/server/omni/script-content-adapter-prompt.ts"),
      join(ui, "src/lib/server/omni/script-content-contract.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
      join(ui, "src/lib/server/omni/openrouter-script-content-adapter.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });
  mirrorAlias("lib");

  const { analyzeScriptContentAndAdapt } = require(findFile(compiled, "openrouter-script-content-adapter.js"));
  process.env.OPENROUTER_API_KEY = "test-key";

  const invalidResponse = JSON.stringify({
    source_meaning: { hook: "Хук" },
    adaptation: { mode: "preserve_reference", reason: "Причина", preserve: [], replace: [], product_bridge: "" },
  });
  const validResponse = JSON.stringify({
    source_meaning: {
      hook: "Как оплатить поездку?",
      main_question: "Как оплачивать расходы за границей?",
      answer_or_mechanism: "Нужна карта для зарубежных покупок.",
      required_points: [],
      proof_examples: [],
      conclusion: "Так расходы оплачиваются удобнее.",
    },
    adaptation: {
      mode: "preserve_reference",
      reason: "Продукт решает ту же платежную задачу.",
      preserve: ["ответ на вопрос reference"],
      replace: [],
      product_bridge: "Покажи оплату расходов картой.",
    },
  });

  let chatResponses = [invalidResponse, validResponse];
  let chatRequestCount = 0;
  const requestBodies = [];
  global.fetch = async (url, init = {}) => {
    if (String(url).includes("/api/v1/model/")) return { ok: false, json: async () => ({}) };
    chatRequestCount += 1;
    requestBodies.push(JSON.parse(String(init.body)));
    const content = chatResponses.shift();
    return response({
      id: `adapter-${chatRequestCount}`,
      model: "test/adapter-repair",
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
  };

  const repaired = await analyzeScriptContentAndAdapt(input("test/adapter-repair"));
  assert.equal(repaired.contract.adaptation.mode, "preserve_reference");
  assert.equal(repaired.attemptCount, 2);
  assert.equal(repaired.openRouterUsage.length, 2);
  assert.equal(chatRequestCount, 2);
  assert.match(requestBodies[1].messages[1].content, /ПРЕДЫДУЩИЙ ОТВЕТ НЕ ПРОШЕЛ ПРОВЕРКУ/u);
  assert.match(requestBodies[1].messages[1].content, /source_meaning/u);

  chatResponses = Array.from({ length: 5 }, () => invalidResponse);
  chatRequestCount = 0;
  requestBodies.length = 0;
  await assert.rejects(
    analyzeScriptContentAndAdapt(input("test/adapter-no-fallback")),
    /failed after 5 attempts/u,
  );
  assert.equal(chatRequestCount, 5);

  const incompatibleResponse = JSON.stringify({
    source_meaning: {
      hook: "Я никогда не мечтала о Мальдивах.",
      main_question: "Как сложилась жизнь за границей?",
      answer_or_mechanism: "Переезд и работа привели меня к жизни на островах.",
      required_points: [],
      proof_examples: [],
      conclusion: "Теперь я живу здесь уже два года.",
    },
    adaptation: {
      mode: "incompatible",
      reason: "История о жизни на Мальдивах не связана с виртуальной картой.",
      preserve: [],
      replace: [],
      product_bridge: "",
    },
  });
  const formatTransferResponse = JSON.stringify({
    source_meaning: {
      hook: "Я никогда не думала, что буду оплачивать всё одной картой.",
      main_question: "Как платить за границей без лишних сложностей?",
      answer_or_mechanism: "Виртуальная карта помогает оплачивать зарубежные расходы.",
      required_points: [],
      proof_examples: [],
      conclusion: "Теперь платежи за границей проходят проще.",
    },
    adaptation: {
      mode: "format_transfer",
      reason: "Переносим личную форму истории на реальную платежную задачу продукта.",
      preserve: ["личный хук", "постепенное раскрытие"],
      replace: ["история о Мальдивах", "переезд и работа"],
      product_bridge: "Новая история раскрывает пользу виртуальной карты для зарубежных оплат.",
    },
  });
  chatResponses = [incompatibleResponse, formatTransferResponse];
  chatRequestCount = 0;
  requestBodies.length = 0;
  const reviewed = await analyzeScriptContentAndAdapt(input("test/adapter-incompatible-review"));
  assert.equal(reviewed.contract.adaptation.mode, "format_transfer");
  assert.equal(reviewed.attemptCount, 2);
  assert.equal(chatRequestCount, 2);
  assert.match(requestBodies[1].messages[1].content, /Если предыдущий ответ выбрал incompatible/u);

  chatResponses = [incompatibleResponse, incompatibleResponse];
  chatRequestCount = 0;
  requestBodies.length = 0;
  const fallback = await analyzeScriptContentAndAdapt(input("test/adapter-incompatible-fallback"));
  assert.equal(fallback.contract.adaptation.mode, "format_transfer");
  assert.equal(fallback.attemptCount, 2);
  assert.equal(chatRequestCount, 2);
  assert.match(fallback.contract.adaptation.reason, /сохранена форма подачи/u);

  console.log("Omni script content adapter retry and strict validation checks passed");
} finally {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  rmSync(output, { recursive: true, force: true });
}

function input(model) {
  return {
    transcript: "Я неделю жил бесплатно. А остальные расходы нужно оплачивать.",
    title: "Как путешествовать дешевле",
    topic: "Путешествия",
    productName: "Плати по миру",
    productDescription: "Виртуальная карта для оплаты за границей.",
    productReferenceNotes: null,
    model,
  };
}

function response(body) {
  return { ok: true, json: async () => body };
}

function mirrorAlias(relativePath) {
  const source = join(compiled, relativePath);
  const target = join(output, "node_modules", "@", relativePath);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function findFile(directory, fileName) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      try { return findFile(path, fileName); } catch { continue; }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName}`);
}
