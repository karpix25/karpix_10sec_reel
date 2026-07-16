import { readFile } from "fs/promises";
import type { WordTimestamp } from "@/types";

export type DeepgramTranscript = {
  transcript: string;
  words: WordTimestamp[];
  raw: unknown;
};

type DeepgramWord = {
  word?: unknown;
  punctuated_word?: unknown;
  start?: unknown;
  end?: unknown;
  confidence?: unknown;
};

function normalizeDeepgramWord(word: DeepgramWord): WordTimestamp | null {
  const start = Number(word.start);
  const end = Number(word.end);
  const text = String(word.word || "").trim();
  const punctuated = String(word.punctuated_word || text).trim();
  if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  return {
    word: text,
    punctuated_word: punctuated || text,
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
    confidence: typeof word.confidence === "number" ? Number(word.confidence.toFixed(3)) : null,
  };
}

export function parseDeepgramTranscription(payload: unknown): DeepgramTranscript {
  const alternative = (payload as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: DeepgramWord[] }> }> };
  })?.results?.channels?.[0]?.alternatives?.[0];
  const words = (alternative?.words || [])
    .map(normalizeDeepgramWord)
    .filter((word): word is WordTimestamp => Boolean(word));

  return {
    transcript: alternative?.transcript || words.map((word) => word.punctuated_word || word.word).join(" "),
    words,
    raw: payload,
  };
}

function getDeepgramApiKey() {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key || key.includes("your_")) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }
  return key;
}

export async function transcribeAudioFileWithDeepgram(filePath: string): Promise<DeepgramTranscript> {
  const audioBuffer = await readFile(filePath);
  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", "nova-3");
  url.searchParams.set("language", "ru");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("utterances", "true");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${getDeepgramApiKey()}`,
      "Content-Type": "audio/wav",
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram HTTP Error ${response.status}: ${errorText.slice(0, 600)}`);
  }

  return parseDeepgramTranscription(await response.json());
}
