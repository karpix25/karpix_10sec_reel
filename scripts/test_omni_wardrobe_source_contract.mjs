import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-wardrobe-source-"));
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
      join(ui, "src/lib/omni/wardrobe-source.ts"),
      join(ui, "src/lib/server/omni/omni-character-contract.ts"),
      join(ui, "src/lib/server/omni/omni-wardrobe-contract.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const {
    DEFAULT_OMNI_WARDROBE_SOURCE,
    normalizeOmniWardrobeSource,
    getOmniWardrobeSourceLabel,
  } = require(findFile(compiled, "wardrobe-source.js"));
  const {
    applyWardrobeSourceToReferenceLock,
    renderAvatarWardrobeLine,
    renderAvatarWardrobeSourceRule,
    shouldUseAvatarWardrobe,
  } = require(findFile(compiled, "omni-wardrobe-contract.js"));

  assert.equal(DEFAULT_OMNI_WARDROBE_SOURCE, "director_reference");
  assert.equal(normalizeOmniWardrobeSource("avatar_reference"), "avatar_reference");
  assert.equal(normalizeOmniWardrobeSource("unexpected"), "director_reference");
  assert.equal(getOmniWardrobeSourceLabel("avatar_reference"), "Всегда с аватара");
  assert.equal(shouldUseAvatarWardrobe("avatar_reference"), true);
  assert.equal(shouldUseAvatarWardrobe("director_reference"), false);

  const characterContract = {
    identityLine: "same approved avatar identity",
    clothingLine: "молочный худи и светлые джинсы из аватара",
    sourceRuleLine: "avatar reference defines identity; product images are separate",
    clothingSource: "product_avatar_notes",
  };
  const wardrobeLine = renderAvatarWardrobeLine(characterContract);
  assert.ok(wardrobeLine.includes("AVATAR WARDROBE LOCK"));
  assert.ok(wardrobeLine.includes("молочный худи"));
  assert.ok(wardrobeLine.includes("Do not copy"));
  assert.ok(wardrobeLine.includes("director reference"));

  const sourceRuleLine = renderAvatarWardrobeSourceRule(characterContract);
  assert.ok(sourceRuleLine.includes("ignore its wardrobe"));
  assert.ok(sourceRuleLine.includes("avatar outfit"));

  const referenceLock = "REFERENCE LOCK: match the original reference direction for wardrobe, lighting, camera framing, background, actions.";
  const avatarLock = applyWardrobeSourceToReferenceLock({
    referenceLockLine: referenceLock,
    wardrobeSource: "avatar_reference",
  });
  assert.ok(!avatarLock.includes("for wardrobe"));
  assert.ok(avatarLock.includes("WARDROBE EXCEPTION"));
  assert.equal(
    applyWardrobeSourceToReferenceLock({ referenceLockLine: referenceLock, wardrobeSource: "director_reference" }),
    referenceLock
  );

  console.log("Omni wardrobe source contract checks passed");
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
