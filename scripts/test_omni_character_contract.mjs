import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-character-contract-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(tsconfig, JSON.stringify({
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
    },
    include: [
      join(ui, "src/lib/omni/types.ts"),
      join(ui, "src/lib/server/omni/omni-character-contract.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const { buildOmniCharacterContract } = require(findFile(compiled, "omni-character-contract.js"));
  const productNotesContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: "Героиня в молочном худи и синих джинсах, без ярких логотипов." },
    avatar: {
      display_name: "Анна",
      prompt: "Улыбчивая девушка, одежда из исходника не важна.",
      reference_url: "https://example.com/avatar.png",
      kie_character_id: "char_123",
    },
  });
  assert.equal(productNotesContract.clothingSource, "product_avatar_notes");
  assert.ok(productNotesContract.identityLine.includes("Анна"));
  assert.ok(productNotesContract.clothingLine.includes("молочном худи"));
  assert.ok(productNotesContract.sourceRuleLine.includes("image_urls задают продукт, а не одежду героя"));

  const avatarPromptContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: {
      display_name: null,
      prompt: "Молодой мужчина, dressed in a plain black t-shirt and relaxed jeans.",
      reference_url: null,
      kie_character_id: "char_456",
    },
  });
  assert.equal(avatarPromptContract.clothingSource, "avatar_prompt");
  assert.ok(avatarPromptContract.clothingLine.includes("black t-shirt"));

  const apronAvatarContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: {
      display_name: "МИША",
      prompt: "Спортивный мужчина, с голубыми глазами, блондин, спортивное телосложение, в фартуке на кухне",
      reference_url: "https://example.com/misha.png",
      kie_character_id: "char_misha",
    },
  });
  assert.equal(apronAvatarContract.clothingSource, "avatar_prompt");
  assert.ok(apronAvatarContract.clothingLine.includes("фартуке"));
  assert.ok(!apronAvatarContract.clothingLine.includes("однотонный светлый верх"));

  const sourceClothingNoiseContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: {
      display_name: null,
      prompt: "Улыбчивая девушка, одежда из исходника не важна.",
      reference_url: "https://example.com/avatar.png",
      kie_character_id: "char_789",
    },
  });
  assert.equal(sourceClothingNoiseContract.clothingSource, "fallback");
  assert.ok(!sourceClothingNoiseContract.clothingLine.includes("исходника"));

  const fallbackContract = buildOmniCharacterContract({
    product: { avatar_reference_notes: null },
    avatar: null,
  });
  assert.equal(fallbackContract.clothingSource, "fallback");
  assert.ok(fallbackContract.clothingLine.includes("фиксированный бытовой outfit"));

  console.log("Omni character contract regression checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(path, fileName);
      } catch {
        continue;
      }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName} in ${dir}`);
}
