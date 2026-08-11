import type { ReactNode } from "react";
import { Camera, Clapperboard, ExternalLink, Image as ImageIcon, Package, Sparkles } from "lucide-react";

export interface StoryboardPreviewFrame {
  time: string;
  spokenWords: string;
  action: string;
  camera: string | null;
  product: string | null;
  productVisible: boolean;
  sfx: string | null;
}

export function StoryboardSegmentPreview({
  frames,
  storyboardReferenceUrl,
}: {
  frames: readonly StoryboardPreviewFrame[];
  storyboardReferenceUrl?: string | null;
}) {
  if (!frames.length && !storyboardReferenceUrl) return null;

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
      {storyboardReferenceUrl ? <StoryboardImagePreview url={storyboardReferenceUrl} /> : <StoryboardImagePending />}
      {frames.length ? (
        <div className="grid gap-1.5 sm:grid-cols-5">
          {frames.map((frame, index) => (
            <div key={`${frame.time}-${index}`} className="min-w-0 rounded-md border border-border/70 bg-muted/25 p-2">
              <div className="mb-1 flex items-center justify-between gap-1">
                <span className="rounded bg-background px-1.5 py-0.5 font-semibold text-primary">{frame.time}</span>
                <span className="text-[11px] font-semibold text-muted-foreground">#{index + 1}{frame.productVisible ? " · продукт" : ""}</span>
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
      ) : null}
    </div>
  );
}

export function extractStoryboardFrames(source: unknown): StoryboardPreviewFrame[] {
  const rawFrames = resolveRawFrames(source);
  const durationSeconds = resolveDurationSeconds(source) || rawFrames.length * 2;
  return rawFrames
    .map((frame, index) => normalizeFrame(frame, index, rawFrames.length, durationSeconds))
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

function StoryboardImagePending() {
  return (
    <div className="mb-2 rounded-md border border-dashed border-border/80 bg-muted/20 px-2 py-2 text-[11px] leading-4 text-muted-foreground">
      Картинка раскадровки появится здесь после создания ролика.
    </div>
  );
}

function StoryboardImagePreview({ url }: { url: string }) {
  return (
    <div className="mb-2 overflow-hidden rounded-md border border-border/70 bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2 py-1.5 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5 font-semibold text-primary">
          <ImageIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Сгенерированная раскадровка</span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded bg-background px-2 py-1 font-semibold text-muted-foreground transition hover:text-primary"
        >
          <ExternalLink className="h-3 w-3" />
          Открыть
        </a>
      </div>
      <a href={url} target="_blank" rel="noreferrer" className="block bg-background">
        <img
          src={url}
          alt="Сгенерированная раскадровка сегмента"
          className="max-h-[420px] w-full object-contain"
          loading="lazy"
        />
      </a>
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
  durationSeconds: number,
): StoryboardPreviewFrame | null {
  const spokenWords =
    readString(frame, "spokenText") ||
    readString(frame, "spoken_text") ||
    readString(frame, "spokenWords") ||
    readString(frame, "spoken_words") ||
    readString(frame, "speech");
  const action = readString(frame, "visualAction") || readString(frame, "visual_action") || readString(frame, "action");

  if (!spokenWords && !action) return null;

  return {
    time: formatTime(frame, index, frameCount, durationSeconds),
    spokenWords: spokenWords || "Без реплики",
    action: action || "Визуальное действие не указано",
    camera: readString(frame, "cameraAngle") || readString(frame, "camera_angle") || readString(frame, "camera"),
    product: readString(frame, "productPlacement") || readString(frame, "product_placement") || readString(frame, "product"),
    productVisible: isVisibleProductPlacement(frame),
    sfx:
      readString(frame, "sfxNotes") ||
      readString(frame, "sfx_notes") ||
      readString(frame, "sfx") ||
      readString(frame, "effects") ||
      readString(frame, "effectNotes") ||
      readString(frame, "effect_notes"),
  };
}

function isVisibleProductPlacement(frame: Record<string, unknown>) {
  const placement = readString(frame, "productPlacement") || readString(frame, "product_placement") || readString(frame, "product") || "";
  return Boolean(placement) && !/(?:вне\s+кадра|не\s+виден|скрыт|hidden|off\s*camera|только тематические объекты)/iu.test(placement);
}

function formatTime(frame: Record<string, unknown>, index: number, frameCount: number, durationSeconds: number) {
  const explicitTime = readString(frame, "time") || readString(frame, "timestamp");
  if (explicitTime) return explicitTime;

  const start = readNumber(frame, "startSeconds") ?? readNumber(frame, "start_seconds");
  const end = readNumber(frame, "endSeconds") ?? readNumber(frame, "end_seconds");
  if (start !== null && end !== null) return `${formatSeconds(start)}-${formatSeconds(end)}s`;
  if (start !== null) return `${formatSeconds(start)}s`;

  const fallbackFrameCount = frameCount || Math.max(1, Math.round(durationSeconds / 2));
  const frameSeconds = durationSeconds / fallbackFrameCount;
  return `${formatSeconds(index * frameSeconds)}-${formatSeconds((index + 1) * frameSeconds)}s`;
}

function resolveDurationSeconds(source: unknown): number | null {
  if (!isRecord(source)) return null;
  return readNumber(source, "durationSeconds") ?? readNumber(source, "duration_seconds");
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
