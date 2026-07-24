import type { ReactNode } from "react";
import { Camera, Clapperboard, Package, Sparkles } from "lucide-react";

export interface StoryboardPreviewFrame {
  time: string;
  spokenWords: string;
  action: string;
  camera: string | null;
  product: string | null;
  sfx: string | null;
}

export function StoryboardSegmentPreview({ frames }: { frames: readonly StoryboardPreviewFrame[] }) {
  if (!frames.length) return null;

  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-primary">
          <Clapperboard className="h-3.5 w-3.5" />
          <span>Storyboard</span>
        </div>
        <span className="rounded bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
          {frames.length} кадров
        </span>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-5">
        {frames.map((frame, index) => (
          <div key={`${frame.time}-${index}`} className="min-w-0 rounded-md border border-border/70 bg-muted/25 p-2">
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="rounded bg-background px-1.5 py-0.5 font-semibold text-primary">{frame.time}</span>
              <span className="text-[11px] font-semibold text-muted-foreground">#{index + 1}</span>
            </div>
            <p className="line-clamp-2 min-h-8 break-words font-semibold leading-4 text-foreground">
              {frame.spokenWords}
            </p>
            <p className="mt-1 line-clamp-3 min-h-12 break-words leading-4 text-muted-foreground">{frame.action}</p>
            <div className="mt-2 grid gap-1 text-[11px] leading-4 text-muted-foreground">
              {frame.camera ? <StoryboardMeta icon={<Camera className="h-3 w-3" />} value={frame.camera} /> : null}
              {frame.product ? <StoryboardMeta icon={<Package className="h-3 w-3" />} value={frame.product} /> : null}
              {frame.sfx ? <StoryboardMeta icon={<Sparkles className="h-3 w-3" />} value={frame.sfx} /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function extractStoryboardFrames(source: unknown): StoryboardPreviewFrame[] {
  const rawFrames = resolveRawFrames(source).slice(0, 5);
  return rawFrames
    .map((frame, index) => normalizeFrame(frame, index, rawFrames.length))
    .filter((frame): frame is StoryboardPreviewFrame => Boolean(frame));
}

function StoryboardMeta({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-1">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <span className="line-clamp-2 min-w-0 break-words">{value}</span>
    </div>
  );
}

function resolveRawFrames(source: unknown): Record<string, unknown>[] {
  if (Array.isArray(source)) return source.filter(isRecord);
  if (!isRecord(source)) return [];

  const directFrames = readArray(source, "frames") || readArray(source, "storyboardFrames") || readArray(source, "storyboard_frames");
  if (directFrames) return directFrames.filter(isRecord);

  const nestedPlan = source.storyboardPlan || source.storyboard_plan;
  if (nestedPlan && nestedPlan !== source) return resolveRawFrames(nestedPlan);

  return [];
}

function normalizeFrame(
  frame: Record<string, unknown>,
  index: number,
  frameCount: number,
): StoryboardPreviewFrame | null {
  const spokenWords = readString(frame, "spokenWords") || readString(frame, "spoken_words") || readString(frame, "speech");
  const action = readString(frame, "visualAction") || readString(frame, "visual_action") || readString(frame, "action");

  if (!spokenWords && !action) return null;

  return {
    time: formatTime(frame, index, frameCount),
    spokenWords: spokenWords || "Без реплики",
    action: action || "Визуальное действие не указано",
    camera: readString(frame, "cameraAngle") || readString(frame, "camera_angle") || readString(frame, "camera"),
    product: readString(frame, "productPlacement") || readString(frame, "product_placement") || readString(frame, "product"),
    sfx: readString(frame, "sfx") || readString(frame, "effects"),
  };
}

function formatTime(frame: Record<string, unknown>, index: number, frameCount: number) {
  const explicitTime = readString(frame, "time") || readString(frame, "timestamp");
  if (explicitTime) return explicitTime;

  const start = readNumber(frame, "startSeconds") ?? readNumber(frame, "start_seconds");
  const end = readNumber(frame, "endSeconds") ?? readNumber(frame, "end_seconds");
  if (start !== null && end !== null) return `${formatSeconds(start)}-${formatSeconds(end)}s`;
  if (start !== null) return `${formatSeconds(start)}s`;

  const fallbackFrameCount = frameCount || 5;
  const frameSeconds = 10 / fallbackFrameCount;
  return `${formatSeconds(index * frameSeconds)}-${formatSeconds((index + 1) * frameSeconds)}s`;
}

function formatSeconds(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function readArray(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join(", ") || null;
  return null;
}

function readNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
