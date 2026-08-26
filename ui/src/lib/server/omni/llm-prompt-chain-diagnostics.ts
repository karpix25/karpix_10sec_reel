import { getOmniStoryboardDurationForWordCount } from "../../omni/storyboard/omni-storyboard-timing";

export type DirectorSegmenterDiagnosticStatus =
  | "request_failed"
  | "parse_failed"
  | "schema_invalid"
  | "contract_invalid"
  | "success";

export type DirectorFrameDiagnostic = {
  arrayIndex: number;
  keys: string[];
  missingFields: string[];
  invalidValues: Record<string, string>;
};

export type DirectorSegmentDiagnostic = {
  arrayIndex: number;
  keys: string[];
  frameField: "storyboard_frames" | "storyboardFrames" | "frames" | "missing";
  frameCount: number | null;
  validFrameCount: number;
  missingFields: string[];
  reasons: string[];
  invalidFrames: DirectorFrameDiagnostic[];
};

export type DirectorSegmenterAttemptDiagnostic = {
  attempt: number;
  model: string;
  status: DirectorSegmenterDiagnosticStatus;
  responseLength: number;
  responsePreview: string;
  rootType: string;
  rootKeys: string[];
  segmentsType: string;
  segmentCount: number | null;
  segmentDiagnostics: DirectorSegmentDiagnostic[];
  error: string | null;
};

type DiagnosticInput = {
  attempt: number;
  model: string;
  content: string;
  parsed?: unknown;
  status: DirectorSegmenterDiagnosticStatus;
  error?: string | null;
};

const FRAME_FIELDS = [
  ["index", (value: Record<string, unknown>) => isPositiveInteger(value.index)],
  ["role", (value: Record<string, unknown>) => isValidRole(value.role)],
  ["spoken_words", (value: Record<string, unknown>) => hasText(value.spoken_words || value.spokenWords || value.speech || value.voiceover)],
  ["visual_description", (value: Record<string, unknown>) => hasText(value.visual_description || value.visualDescription || value.visual)],
  ["camera", (value: Record<string, unknown>) => hasText(value.camera)],
  ["action", (value: Record<string, unknown>) => hasText(value.action)],
] as const;

export function diagnoseDirectorSegmenterOutput(input: DiagnosticInput): DirectorSegmenterAttemptDiagnostic {
  const root = asRecord(input.parsed);
  const rawSegments = root?.segments;
  const segmentDiagnostics = Array.isArray(rawSegments)
    ? rawSegments.map((segment, arrayIndex) => diagnoseSegment(segment, arrayIndex))
    : [];

  return {
    attempt: input.attempt,
    model: input.model,
    status: input.status,
    responseLength: input.content.length,
    responsePreview: compactPreview(input.content),
    rootType: describeType(input.parsed),
    rootKeys: root ? Object.keys(root).slice(0, 40) : [],
    segmentsType: describeType(rawSegments),
    segmentCount: Array.isArray(rawSegments) ? rawSegments.length : null,
    segmentDiagnostics,
    error: input.error || null,
  };
}

export function formatDirectorSegmenterDiagnostic(diagnostic: DirectorSegmenterAttemptDiagnostic) {
  const parts = [
    `root=${diagnostic.rootType}`,
    `root_keys=${diagnostic.rootKeys.join(",") || "none"}`,
    `segments=${diagnostic.segmentsType}${diagnostic.segmentCount === null ? "" : `[${diagnostic.segmentCount}]`}`,
  ];
  const invalidSegments = diagnostic.segmentDiagnostics
    .filter((segment) => segment.reasons.length || segment.invalidFrames.length)
    .slice(0, 4)
    .map((segment) => {
      const frameDetails = segment.invalidFrames
        .slice(0, 3)
        .map((frame) => {
          const invalid = Object.entries(frame.invalidValues)
            .map(([field, value]) => `${field}=${JSON.stringify(value)}`)
            .join(",");
          return `frame[${frame.arrayIndex}] missing=${frame.missingFields.join(",") || "none"}${invalid ? ` invalid=${invalid}` : ""}`;
        })
        .join(" ");
      return `segment[${segment.arrayIndex}] ${segment.reasons.join(",") || "invalid_frame"}${frameDetails ? ` ${frameDetails}` : ""}`;
    });
  return [...parts, ...invalidSegments].join("; ").slice(0, 1_600);
}

function diagnoseSegment(raw: unknown, arrayIndex: number): DirectorSegmentDiagnostic {
  const data = asRecord(raw);
  if (!data) {
    return {
      arrayIndex,
      keys: [],
      frameField: "missing",
      frameCount: null,
      validFrameCount: 0,
      missingFields: [],
      reasons: ["segment_not_object"],
      invalidFrames: [],
    };
  }

  const frameField = resolveFrameField(data);
  const rawFrames = frameField === "missing" ? undefined : data[frameField];
  const frameDiagnostics = Array.isArray(rawFrames)
    ? rawFrames.map((frame, frameIndex) => diagnoseFrame(frame, frameIndex))
    : [];
  const validFrameCount = frameDiagnostics.filter((frame) => !frame.missingFields.length).length;
  const reasons: string[] = [];
  if (!isPositiveInteger(data.index)) reasons.push("missing_or_invalid_index");
  if (frameField === "missing") reasons.push("missing_storyboard_frames");
  else if (!Array.isArray(rawFrames)) reasons.push("storyboard_frames_not_array");
  if (Array.isArray(rawFrames) && validFrameCount === 0) reasons.push("no_valid_storyboard_frames");
  if (!hasText(data.voiceover) && validFrameCount === 0) reasons.push("missing_voiceover");
  const voiceover = hasText(data.voiceover)
    ? String(data.voiceover)
    : frameDiagnostics
      .filter((frame) => !frame.missingFields.length)
      .map((frame) => readFrameSpeech(rawFrames, frame.arrayIndex))
      .filter(Boolean)
      .join(" ");
  const inferredDuration = getOmniStoryboardDurationForWordCount(countWords(voiceover));
  if (!isPositiveInteger(data.duration_seconds || data.durationSeconds) && !inferredDuration) {
    reasons.push("missing_duration_seconds_and_cannot_infer");
  }

  return {
    arrayIndex,
    keys: Object.keys(data).slice(0, 40),
    frameField,
    frameCount: Array.isArray(rawFrames) ? rawFrames.length : null,
    validFrameCount,
    missingFields: unique(reasons),
    reasons: unique(reasons),
    invalidFrames: frameDiagnostics.filter((frame) => frame.missingFields.length).slice(0, 20),
  };
}

function diagnoseFrame(raw: unknown, arrayIndex: number): DirectorFrameDiagnostic {
  const data = asRecord(raw);
  if (!data) {
    return { arrayIndex, keys: [], missingFields: ["frame_not_object"], invalidValues: {} };
  }
  const missingFields = FRAME_FIELDS
    .filter(([, isValid]) => !isValid(data))
    .map(([field]) => field);
  const invalidValues: Record<string, string> = {};
  if (missingFields.includes("role") && data.role !== undefined && data.role !== null) {
    invalidValues.role = String(data.role).slice(0, 80);
  }
  return { arrayIndex, keys: Object.keys(data).slice(0, 30), missingFields, invalidValues };
}

function readFrameSpeech(rawFrames: unknown, arrayIndex: number) {
  if (!Array.isArray(rawFrames)) return "";
  const frame = asRecord(rawFrames[arrayIndex]);
  return frame ? String(frame.spoken_words || frame.spokenWords || frame.speech || frame.voiceover || "") : "";
}

function countWords(value: string) {
  return value.split(/\s+/u).filter(Boolean).length;
}

function resolveFrameField(data: Record<string, unknown>): DirectorSegmentDiagnostic["frameField"] {
  if (Object.prototype.hasOwnProperty.call(data, "storyboard_frames")) return "storyboard_frames";
  if (Object.prototype.hasOwnProperty.call(data, "storyboardFrames")) return "storyboardFrames";
  if (Object.prototype.hasOwnProperty.call(data, "frames")) return "frames";
  return "missing";
}

function isValidRole(value: unknown) {
  return ["face_open", "product_cutaway", "environment_cutaway", "face_return", "cutaway"].includes(String(value));
}

function isPositiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0;
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function describeType(value: unknown) {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function compactPreview(value: string, maxLength = 2_400) {
  const text = value
    .replace(/(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+\S+)/gu, "[redacted]")
    .replace(/\s+/gu, " ")
    .trim();
  if (text.length <= maxLength) return text;
  const headLength = Math.floor(maxLength * 0.7);
  return `${text.slice(0, headLength)} … ${text.slice(-Math.floor(maxLength * 0.25))}`;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}
