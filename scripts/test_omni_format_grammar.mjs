import assert from "node:assert/strict";
import fs from "node:fs";

const grammarSource = fs.readFileSync("ui/src/lib/server/omni/director-format-grammar.ts", "utf8");
const analysisPrompt = fs.readFileSync("ui/src/lib/server/omni/director-analysis-prompt.ts", "utf8");
const writerPrompt = fs.readFileSync("ui/src/lib/server/omni/script-prompt-helper.ts", "utf8");
const chainPrompt = fs.readFileSync("ui/src/lib/server/omni/llm-prompt-chain-prompts.ts", "utf8");

assert.match(analysisPrompt, /director-brief-v17-format-grammar/u);
assert.match(analysisPrompt, /format_grammar is the universal operational grammar/u);
assert.match(analysisPrompt, /Do not name a known template instead of decomposing it/u);
assert.match(grammarSource, /beat_sequence: DirectorFormatBeat\[\]/u);
assert.match(grammarSource, /minimum_adapted_repetitions/u);
assert.match(grammarSource, /Do not flatten the format into a generic monologue/u);
assert.match(writerPrompt, /renderDirectorFormatGrammarContract/u);
assert.match(writerPrompt, /Сохрани операции FORMAT GRAMMAR/u);
assert.match(chainPrompt, /const formatGrammar = renderDirectorFormatGrammarContract/u);
assert.match(chainPrompt, /\$\{formatGrammar\}/u);

console.log("omni format grammar contract: ok");
