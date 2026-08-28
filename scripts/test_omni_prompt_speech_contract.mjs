import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-prompt-speech-"));
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
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/**/*.ts"),
      join(ui, "src/lib/audio-library/moods.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);
  const moodsOutput = findFile(compiled, "moods.js");
  const aliasMoods = join(output, "node_modules", "@", "lib", "audio-library", "moods.js");
  mkdirSync(dirname(aliasMoods), { recursive: true });
  copyFileSync(moodsOutput, aliasMoods);
  for (const fileName of ["omni-storyboard-timing.js", "omni-storyboard-types.js", "omni-storyboard-contract.js"]) {
    const source = findFile(compiled, fileName);
    const target = join(output, "node_modules", "@", "lib", "omni", "storyboard", fileName);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }

  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const { validatePromptVoiceoverIsolation } = require(findFile(compiled, "omni-prompt-validator.js"));
  const { buildStoryboardImagePrompt } = require(findFile(compiled, "omni-storyboard-image-prompt.js"));
  const { renderFrameTransitionNote, renderReferenceTransitionCue } = require(findFile(compiled, "omni-storyboard-effects.js"));
  const { extractDirectorReferenceVideoUrl } = require(findFile(compiled, "director-reference-video-url.js"));
  const frameTiming = require(findFile(compiled, "storyboard-reference-frame-timing.js"));
  const prompts = buildOmniSegmentPrompts(buildInput());

  const filmTransitionBrief = { montage_rhythm: { transition_style: ["film burn / light leak"] } };
  assert.match(renderReferenceTransitionCue(filmTransitionBrief), /film burn\/light leak/iu);
  assert.match(renderFrameTransitionNote(filmTransitionBrief, 2), /film-burn\/light-leak/iu);

  assert.deepEqual(validatePromptVoiceoverIsolation(prompts), []);
  for (const item of prompts) {
    assert.equal(normalizedCount(item.prompt, item.voiceoverText), 1);
    assert.ok(!/СЦЕНАРНЫЕ БИТЫ ЭТОЙ ЧАСТИ:[\s\S]*?\bречь\s*-/iu.test(item.prompt));
    assert.ok(!item.prompt.includes("Реплика персонажа:"), "legacy frame speech marker must not be used");
    assert.ok(!item.prompt.includes("Озвучка:"), "storyboard prompt must not imply background voiceover");
    assert.ok(item.prompt.includes("по раскадровке"), "storyboard prompt must bind video to storyboard");
    assert.ok(item.prompt.includes("Динамичный разговорный ролик"), "storyboard prompt must request a dynamic conversational reel");
    assert.ok(item.prompt.includes("@storyboard_file"), "storyboard prompt must keep file placeholder until KIE upload order is known");
    const productVisible = item.storyboardPlan.frames.some((frame) =>
      !/в\s+кадре\s+только\s+тематические|(?:продукт|товар)\s+вне\s+кадра/iu.test(frame.productPlacement)
    );
    if (productVisible) {
      assert.ok(item.prompt.includes("@product_file"), "product-visible segments must keep the product file placeholder");
      assert.ok(item.prompt.includes("Продукт из"), "product-visible segments must bind the product file");
      assert.ok(item.prompt.includes("неизменная упаковка"), "product-visible segments must preserve product packaging");
    } else {
      assert.ok(!item.prompt.includes("@product_file"), "product-hidden segments must not reference the product file");
      assert.ok(item.prompt.includes("продукт вне кадра"), "product-hidden segments must keep the product off camera");
    }
    assert.ok(item.prompt.includes("не показывай саму раскадровку"), "storyboard prompt must not render storyboard panels");
    assert.ok(item.prompt.includes("app interface") || item.prompt.includes("интерфейс соцсетей") || item.prompt.includes("телефон, экран, интерфейс, соцсети"), "storyboard prompt must forbid embedded social UI");
    assert.ok(item.prompt.includes("Оживи панели"), "storyboard prompt must convert frames into live scenes");
    assert.ok(item.prompt.includes("сохрани визуал"), "storyboard prompt must ask to copy storyboard visual");
    assert.ok(item.prompt.includes("Лицо и личность персонажа бери из avatar/character reference"), "storyboard prompt must limit avatar reference to identity");
    assert.ok(item.prompt.includes("одежду, свет, фон, ракурс и действия бери из раскадровки"), "storyboard prompt must make storyboard wardrobe and scene authoritative");
    assert.ok(item.prompt.includes("те же волосы, пробор, аксессуары"), "storyboard prompt must keep hair and outfit details stable");
    assert.ok(item.prompt.includes("WARDROBE CONTINUITY") || item.prompt.includes("один и тот же полный комплект одежды"), "storyboard prompt must carry the analyzed wardrobe policy");
    assert.ok(item.prompt.includes("смотрит прямо в объектив"), "storyboard prompt must keep eye contact across camera angles");
    if (productVisible) {
      assert.ok(item.prompt.includes("Состояние продукта держи одинаковым"), "visible product segments must keep product physical state stable");
    }
    assert.ok(item.prompt.includes(`Ровно ${item.storyboardPlan.frames.length} живых эпизодов`), "storyboard prompt must lock the exact storyboard frame count");
    assert.ok(!item.prompt.includes("DELIVERY DIRECTION"), "storyboard prompt must not use weak delivery direction blocks");
    assert.ok(item.prompt.includes("Точная реплика персонажа"), "storyboard prompt must provide direct segment speech text");
    assert.ok(item.prompt.includes("на русском языке"), "storyboard prompt must force Russian character speech");
    assert.ok(item.prompt.includes("произнеси строго указанную реплику"), "storyboard prompt must request one complete delivery");
    assert.ok(item.prompt.includes("реплику в кавычках один раз"), "storyboard prompt must prevent speech restarts");
    assert.ok(item.prompt.includes("одна непрерывная аудиодорожка"), "visual cuts must not restart segment speech");
    assert.ok(!/речь:\s*"/iu.test(item.prompt), "storyboard frame lines must not repeat spoken chunks");
    assert.ok(item.prompt.includes("Без фоновой музыки"), "storyboard prompt must forbid Omni music");
    assert.ok(!item.prompt.includes("субтитры примени как с референса"), "storyboard prompt must not ask to copy subtitles");
    const promptLimit = item.validation?.valid === false ? 2800 : 2400;
    assert.ok(item.prompt.length < promptLimit, `storyboard prompt must stay short: ${item.prompt.length}`);
    assert.equal(item.storyboardPlan.frames.length, item.durationSeconds / 2, "storyboard frame count must follow duration");
    assert.match(item.prompt, /Точная реплика персонажа[\s\S]*"[^"\n]+"/u, "spoken text must be the only quoted delivery line");

    const imagePrompt = buildStoryboardImagePrompt({
      segmentIndex: item.index,
      storyboard: item.storyboardPlan,
      productName: "Аэрогриль",
      avatarReferenceUrl: "https://example.com/avatar.png",
      productReferenceUrls: productVisible ? ["https://example.com/air-fryer.png"] : [],
      directorReferenceImageUrls: [
        "https://example.com/source-frame-1.jpg",
        "https://example.com/source-frame-2.jpg",
        "https://example.com/source-frame-3.jpg",
        "https://example.com/source-frame-4.jpg",
      ],
      canonicalStoryboardReferenceUrl: item.index > 1 ? "https://example.com/first-storyboard.jpg" : null,
    });
    assert.ok(imagePrompt.includes(`смысл кадра: ${item.storyboardPlan.frames[0].spokenText}`), "storyboard image prompt must preserve speech meaning for visual planning");
    assert.ok(imagePrompt.includes("без букв, цифр, реплик, заголовков"), "storyboard image prompt must keep provider references text-free");
    assert.ok(!imagePrompt.includes("РЕПЛИКА \""), "storyboard image prompt must not render spoken text as a caption");
    assert.ok(imagePrompt.includes(`ровно ${item.storyboardPlan.frames.length} вертикальных панелей`), "storyboard image prompt must lock the storyboard panel count");
    assert.ok(imagePrompt.includes("@file1 - avatar/character reference"), "storyboard image prompt must bind the avatar file");
    assert.ok(
      imagePrompt.includes("кадры оригинала: источник локации") ||
      imagePrompt.includes("кадры оригинала: источник только локации") ||
      imagePrompt.includes("кадры оригинала: только вдохновение") ||
      imagePrompt.includes("кадры оригинала: вдохновение"),
      "storyboard image prompt must preserve the source visual contract"
    );
    assert.ok(/кадры оригинала: (?:источник (?:только )?локации|(?:только )?вдохновение)/iu.test(imagePrompt), "storyboard image prompt must limit source frames to visual setup");
    assert.ok(
      imagePrompt.includes("Сохрани одного героя, одну одежду") || imagePrompt.includes("OUTFIT LOCK"),
      "storyboard image prompt must lock outfit continuity"
    );
    assert.ok(
      imagePrompt.includes("одинаковые волосы") || imagePrompt.includes("волос"),
      "storyboard image prompt must lock hair details"
    );
    assert.ok(imagePrompt.includes("герой смотрит прямо в объектив"), "storyboard image prompt must lock eye contact");
    assert.ok(imagePrompt.includes("OUTFIT LOCK") || imagePrompt.includes("CLOTHING LOCK (all panels)"), "storyboard image prompt must lock wardrobe details");
    if (item.index > 1) {
      assert.ok(imagePrompt.includes("эталон одежды из первого утверждённого storyboard"), "later storyboards must receive the canonical outfit reference");
      assert.ok(!imagePrompt.includes("CLOTHING LOCK (all panels)"), "the reference wardrobe must not override the canonical outfit");
    }
    assert.ok(imagePrompt.includes("фиксирует лицо, пол, возраст, волосы, телосложение и личность"), "storyboard image prompt must limit avatar reference to identity");
    assert.ok(imagePrompt.includes("Смысл реплики определяет главный предмет и действие кадра"), "storyboard image prompt must request semantic reference-driven shots");
    if (productVisible) {
      assert.ok(imagePrompt.includes("Продукт впервые появляется"), "storyboard image prompt must require a clear natural product reveal");
    }
    assert.ok(imagePrompt.includes("никогда не являются нейтральным реквизитом"), "storyboard image prompt must replace source products");
    assert.ok(imagePrompt.includes("нейтральный реквизит"), "storyboard image prompt must keep neutral reference props secondary");
    assert.ok(imagePrompt.includes("Не добавляй selfie-ракурсы"), "storyboard image prompt must not invent camera transitions");
    assert.ok(imagePrompt.length < 4300, `storyboard image prompt must stay under KIE text limit: ${imagePrompt.length}`);
    if (!productVisible) {
      assert.ok(!imagePrompt.includes("Продукт: Аэрогриль"), "first storyboard prompt must not name the product");
      assert.ok(!imagePrompt.includes("Product reference URLs"), "first storyboard prompt must not leak product references");
      assert.ok(imagePrompt.includes("Product reference не передан"), "hidden product storyboard prompt must keep product refs absent");
    } else {
      assert.ok(imagePrompt.includes("точный продукт Аэрогриль"), "product-visible storyboard prompt must name the product");
      assert.ok(imagePrompt.includes("product reference"), "product-visible storyboard prompt must include product references");
    }
  }

  const pipImagePrompt = buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard: prompts[0].storyboardPlan,
    productName: "Аэрогриль",
    avatarReferenceUrl: "https://example.com/avatar.png",
    directorReferenceImageUrls: ["https://example.com/source-frame-1.jpg"],
    directorBrief: {
      visual_hook: { action: "presenter in lower-left cutout", retention_trigger: "" },
      atmosphere: { mood: "", lighting: "", color_grading: "", setting: "" },
      camera: { shot_types: [], angles: [], movements: [], stabilization: "" },
      action_beats: [],
      reusable_mechanics: {
        visual_mechanics: ["picture-in-picture"],
        safe_zones_for_elements: "lower-left",
        looping_pattern: "",
      },
    },
  });
  assert.ok(pipImagePrompt.includes("REFERENCE LAYOUT: оригинал целиком в PIP/collage"), "PIP storyboard prompt must preserve the reference layout");
  assert.ok(pipImagePrompt.includes("не делай centered talking-head"), "PIP storyboard prompt must reject a generic centered presenter shot");

  const physicalContract = "The product remains a stable black countertop air fryer with the same hard shell, basket shape, matte finish, and compact appliance proportions throughout the scene. It moves only as one intact appliance when handled and stays visually identical to the reference.";
  const physicalInput = buildInput();
  physicalInput.product.product_physical_contract = physicalContract;
  physicalInput.product.product_physical_contract_status = "edited";
  const physicalPrompts = buildOmniSegmentPrompts(physicalInput);
  assert.ok(
    physicalPrompts.some((item) => item.prompt.includes("PRODUCT PHYSICAL CONTRACT:")),
    "Omni provider prompts must include the physical contract when the product appears"
  );
  assert.ok(
    physicalPrompts.some((item) => item.prompt.includes("stable black countertop air fryer")),
    "Omni provider prompts must carry the positive physical target state"
  );

  const physicalStoryboard = physicalPrompts.find((item) => item.storyboardPlan)?.storyboardPlan;
  assert.ok(physicalStoryboard, "physical contract test needs a storyboard plan");
  const imagePromptWithPhysicalHint = buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard: physicalStoryboard,
    productName: "Аэрогриль",
    productPhysicalContract: physicalContract,
    avatarReferenceUrl: "https://example.com/avatar.png",
    productReferenceUrls: ["https://example.com/air-fryer.png"],
  });
  assert.ok(!imagePromptWithPhysicalHint.includes("PRODUCT PHYSICAL CONTRACT:"), "GPT Image prompt must not receive provider contract heading");
  assert.ok(imagePromptWithPhysicalHint.includes("физическое состояние продукта"), "GPT Image prompt should receive only a compact visual physical hint");

  const frameGatedStoryboard = {
    ...physicalStoryboard,
    frames: physicalStoryboard.frames.map((frame, index) => ({
      ...frame,
      spokenText: index === 1 ? "Аэрогриль в этой реплике" : frame.spokenText,
      productPlacement: index === 1 ? "аэрогриль в руке" : "в кадре только тематические объекты",
    })),
  };
  const frameGatedImagePrompt = buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard: frameGatedStoryboard,
    productName: "Аэрогриль",
    avatarReferenceUrl: "https://example.com/avatar.png",
    productReferenceUrls: ["https://example.com/air-fryer.png"],
  });
  assert.ok(frameGatedImagePrompt.includes("впервые появляется только в панели 2"));
  assert.ok(frameGatedImagePrompt.includes("продукт в этом кадре не показывай"));

  assert.equal(normalizedCount(prompts[0].prompt, prompts[1].voiceoverText), 0);
  assert.equal(normalizedCount(prompts[1].prompt, prompts[0].voiceoverText), 0);
  assert.equal(normalizedCount(prompts[1].prompt, prompts[2].voiceoverText), 0);
  assert.equal(
    extractDirectorReferenceVideoUrl({
      director_video_url: "https://cdn.example.com/reference.mp4",
      product_refs: [{ url: "https://cdn.example.com/product.png" }],
    }),
    "https://cdn.example.com/reference.mp4"
  );
  assert.equal(
    extractDirectorReferenceVideoUrl({
      original_reels_url: "https://www.instagram.com/reels/DWgvjUfkeCO",
      stored_video_url: "https://cdn.example.com/stored-reference.mp4",
    }),
    "https://cdn.example.com/stored-reference.mp4",
    "Instagram page URLs must not be treated as downloadable reference videos"
  );
  assert.equal(
    extractDirectorReferenceVideoUrl({ reels_url: "https://www.instagram.com/reels/DWgvjUfkeCO" }),
    null,
    "plain Instagram pages must fall back instead of being passed to ffmpeg"
  );
  assert.equal(
    extractDirectorReferenceVideoUrl({ product_refs: [{ url: "https://cdn.example.com/product.png" }] }),
    null
  );
  assert.equal(frameTiming.STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT, 2);
  const referenceSegments = [
    { index: 1, durationSeconds: 10 },
    { index: 2, durationSeconds: 10 },
    { index: 3, durationSeconds: 10 },
  ];
  const firstSegmentSeeks = frameTiming.buildSegmentReferenceSeekSeconds({
    segment: referenceSegments[0],
    segments: referenceSegments,
    sourceDurationSeconds: 90,
  });
  const secondSegmentSeeks = frameTiming.buildSegmentReferenceSeekSeconds({
    segment: referenceSegments[1],
    segments: referenceSegments,
    sourceDurationSeconds: 90,
  });
  assert.equal(firstSegmentSeeks.length, 2);
  assert.equal(secondSegmentSeeks.length, 2);
  assert.ok(firstSegmentSeeks.every((seek) => seek > 0 && seek < 30), "first segment seeks must stay in first source range");
  assert.ok(secondSegmentSeeks.every((seek) => seek > 30 && seek < 60), "second segment seeks must stay in second source range");
  assert.equal(frameTiming.readSourceDurationSeconds({ source_snapshot: { duration_seconds: 147 } }), 147);

  const storedInput = buildStoredPromptInput();
  const storedPrompts = buildOmniSegmentPrompts(storedInput);
  const storedSegments = storedInput.generatedScript.source_snapshot.llm_prompt_chain.providerPromptPlan.segmentPrompts;
  assert.equal(storedPrompts.length, storedSegments.length);
	  storedPrompts.forEach((item, index) => {
	    assert.notEqual(item.prompt, storedSegments[index].prompt);
	    assert.ok(item.prompt.includes("Динамичный разговорный ролик"));
    assert.equal(
      item.prompt.includes("@product_file"),
      item.creativePlan.productRole !== "hidden",
      JSON.stringify({ index: item.index, role: item.creativePlan.productRole, placements: item.storyboardPlan.frames.map((frame) => frame.productPlacement) })
    );
    if (item.creativePlan.productRole !== "hidden") {
      assert.ok(item.storyboardPlan.frames.some((frame) => /аэрогрил/iu.test(frame.productPlacement)));
    }
      assert.equal(normalizedCount(item.prompt, item.voiceoverText), 1);
	    assert.equal(item.voiceoverText, storedSegments[index].voiceover);
	    assert.equal(item.storyboardPlan.frames.length, item.durationSeconds / 2);
    assert.ok(!item.prompt.includes("PRODUCT ACTION:"), "stored LLM prompt path must not inject product action blocks");
    assert.ok(!item.prompt.includes("SCENE ACTION:"), "stored LLM prompt path must not inject scene action blocks");
	    assert.ok(!item.prompt.includes("REFERENCE SEGMENT CONTRACT"), "stored LLM prompt path must not inject the verbose reference plan");
	    assert.ok(!item.prompt.includes("SOURCE INTERVAL OVERRIDE"), "stored LLM prompt path must not inject per-frame source overrides");
	    assert.ok(item.prompt.includes("CONTINUITY:"), "stored LLM prompt path must keep the compact segment boundary contract");
	  });

	  const legacyStoredInput = buildStoredPromptInput({ omitStoryboardFrames: true });
	  assert.throws(
	    () => buildOmniSegmentPrompts(legacyStoredInput),
	    /storyboard|frames|Раскадров/iu,
	    "stored LLM prompt path must reject snapshots without storyboard frames"
	  );

	  console.log("Omni prompt speech contract regression checks passed");
	} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildInput() {
  const voiceSegments = [
    "Вот аэрогриль готовит ужин быстро, с хрустящей корочкой и без лишнего масла.",
    "Ставлю аэрогриль на стол, показываю чашу и объясняю, как он экономит силы.",
    "Если нужен помощник, артикул аэрогриля в описании, сравни варианты перед покупкой сам.",
  ];
  return {
    generatedScript: {
      id: 71,
      project_id: 7,
      product_id: 10,
      script: voiceSegments.join(" "),
      source_snapshot: {
        generated_script_plan: {
          hook_options: ["Аэрогриль без лишнего масла"],
          selected_hook: "Аэрогриль без лишнего масла",
          beats: [
            {
              stage: "hook",
              visual_cue: "Герой на кухне показывает реальный аэрогриль на столе.",
              voiceover: voiceSegments[0],
            },
            {
              stage: "body",
              visual_cue: "Рука слегка поворачивает продукт, видна контактная тень на кухонной поверхности.",
              voiceover: voiceSegments[1],
            },
            {
              stage: "cta",
              visual_cue: "Возврат к лицу на той же кухне, фон не меняется.",
              voiceover: voiceSegments[2],
            },
          ],
        },
      },
    },
    legacyTranscript: null,
    product: {
      id: 10,
      project_id: 7,
      name: "Аэрогриль",
      description: "Кухонный аэрогриль для приготовления блюд без лишнего жира",
      product_reference_notes: "Черный настольный аэрогриль на кухонной поверхности.",
      product_refs: [{
        id: "air-fryer",
        url: "https://example.com/air-fryer.png",
        kind: "image",
        role: "product_primary",
        is_primary: true,
      }],
      avatar_refs: [],
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: {
      id: 3,
      project_id: 7,
      display_name: "Елисей",
      speech_gender: "male",
      prompt: "Мужчина в домашнем кухонном образе.",
      reference_url: "https://example.com/avatar.png",
      status: "approved",
      provider: "kie-omni",
      kie_character_id: "char_air",
      kie_character_status: "completed",
      kie_character_payload: null,
      is_active: true,
      created_at: "2026-07-22T00:00:00.000Z",
      updated_at: "2026-07-22T00:00:00.000Z",
    },
    segmentCount: 3,
    segmentSeconds: 10,
    voiceSegments: voiceSegments.map((text, index) => ({
      index: index + 1,
      text,
      wordCount: text.split(/\s+/u).filter(Boolean).length,
    })),
    segmentDurationsSeconds: [6, 6, 6],
    brief: null,
    targetAudience: "люди, которые готовят дома",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };
}

function buildStoredPromptInput(options = {}) {
  const input = buildInput();
  const voiceSegments = input.voiceSegments.map((segment) => segment.text);
  input.generatedScript.source_snapshot.llm_prompt_chain = {
    providerPromptPlan: {
      version: "llm-prompt-chain-v1",
      format: "talking_head_cutaways",
	      segmentPrompts: voiceSegments.map((voiceover, index) => ({
	        index: index + 1,
	        durationSeconds: 6,
	        voiceover,
	        storyboardFrames: options.omitStoryboardFrames ? [] : makeStoredStoryboardFrames(voiceover, index),
	        referenceRole: "avatar",
	        prompt: [
	          "Вертикальное живое видео на кухне.",
	          "Миша начинает с лица в камеру и говорит энергично.",
	          "В середине короткая перебивка на аэрогриль на столе без рук.",
	          "Затем возврат к лицу в той же кухне.",
	          "Свою музыку не добавляй.",
	          `Речь звучит точно: ${voiceover}`,
	        ].join(" "),
	      })),
      notes: "Готовые промпты написаны LLM.",
    },
  };
  return input;
}

function makeStoredStoryboardFrames(voiceover, segmentIndex) {
  const words = voiceover.split(/\s+/u).filter(Boolean);
  return [0, 1, 2].map((index) => ({
    index: index + 1,
    role: index === 0 ? "face_open" : index === 2 ? "face_return" : segmentIndex === 0 ? "environment_cutaway" : "product_cutaway",
    spokenWords: words.slice(index * 4, index * 4 + 4).join(" "),
    visualDescription: segmentIndex === 0
      ? "живая кухня с тем же человеком и свободными руками"
      : "живая кухня с тем же человеком и продуктом",
    camera: index === 2 ? "крупный план продукта" : "фронтальный план на телефон",
    action: segmentIndex === 0
      ? "персонаж продолжает мысль с пустыми руками"
      : "персонаж продолжает мысль и показывает продукт",
    productState: segmentIndex === 0 ? "товар вне кадра" : "аэрогриль стоит на столе без рук",
    sfx: "тихие естественные звуки кухни",
    referenceRole: segmentIndex === 0 || index === 0 || index === 4 ? "avatar" : "product",
  }));
}

function normalizedCount(haystack, needle) {
  const normalizedHaystack = normalize(haystack);
  const normalizedNeedle = normalize(needle);
  return normalizedNeedle ? normalizedHaystack.split(normalizedNeedle).length - 1 : 0;
}

function normalize(value) {
  return String(value).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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
