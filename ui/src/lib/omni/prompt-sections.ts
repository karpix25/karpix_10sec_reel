export type OmniPromptSections = {
  scriptBeat: string | null;
  voiceover: string | null;
  ugcStyle: string | null;
};

const SECTION_HEADERS = [
  "MOBILE UGC STYLE:",
  "SCENARIO VISUAL WORLD:",
  "CONTINUITY:",
  "SEGMENT STORY GOAL:",
  "SHOT PLAN:",
  "SCRIPT BEAT TO VISUALIZE:",
  "SPOKEN AUDIO / VOICEOVER:",
  "FULL REEL CONTEXT FOR CONTINUITY ONLY:",
  "PRODUCT CONTEXT:",
  "AVATAR CONTEXT:",
  "VISUAL RULES:",
];

export function extractOmniPromptSections(prompt: string | null | undefined): OmniPromptSections {
  return {
    scriptBeat: extractSection(prompt, "SCRIPT BEAT TO VISUALIZE:"),
    voiceover: normalizeVoiceover(extractSection(prompt, "SPOKEN AUDIO / VOICEOVER:")),
    ugcStyle: extractSection(prompt, "MOBILE UGC STYLE:"),
  };
}

function extractSection(prompt: string | null | undefined, header: string) {
  if (!prompt) return null;
  const start = prompt.indexOf(header);
  if (start < 0) return null;
  const contentStart = start + header.length;
  const nextHeader = SECTION_HEADERS
    .filter((candidate) => candidate !== header)
    .map((candidate) => prompt.indexOf(candidate, contentStart))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const raw = prompt.slice(contentStart, nextHeader ?? prompt.length).trim();
  return raw || null;
}

function normalizeVoiceover(value: string | null) {
  if (!value) return null;
  return value.replace(/^Say only this segment text in natural Russian speech:\s*/i, "").trim();
}
