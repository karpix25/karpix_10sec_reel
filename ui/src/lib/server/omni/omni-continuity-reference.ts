import pool from "@/lib/db";
import type { OmniReelSegment } from "@/lib/omni/types";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import { uploadKieContinuityFrameFromUrl } from "./omni-frame-continuity";

export type ContinuityReferenceResolution = {
  image: { url: string; fieldName: string; role: "previous_last_frame" } | null;
  metadata: Record<string, unknown>;
};

export function isOmniContinuityChainEnabled() {
  const value = String(process.env.OMNI_CONTINUITY_CHAIN || "").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
}

export function isSegmentBlockedByContinuityChain(
  segment: OmniReelSegment,
  segments: OmniReelSegment[]
) {
  if (!isOmniContinuityChainEnabled() || segment.segment_index <= 1) return false;
  const previous = findPreviousSegment(segment, segments);
  return previous?.status !== "completed";
}

export async function resolveContinuityReference(input: {
  provider: OmniGenerationProvider;
  segment: OmniReelSegment;
  segments: OmniReelSegment[];
  fieldName: string;
}): Promise<ContinuityReferenceResolution> {
  if (!isOmniContinuityChainEnabled() || input.segment.segment_index <= 1) {
    return { image: null, metadata: { enabled: isOmniContinuityChainEnabled(), applied: false } };
  }

  const previous = findPreviousSegment(input.segment, input.segments);
  if (!previous || previous.status !== "completed") {
    return {
      image: null,
      metadata: {
        enabled: true,
        applied: false,
        blocked: true,
        reason: "previous_segment_not_completed",
      },
    };
  }

  if (!previous.continuity_frame_url) {
    return {
      image: null,
      metadata: {
        enabled: true,
        applied: false,
        sourceSegmentId: previous.id,
        reason: "continuity_frame_unavailable",
      },
    };
  }

  if (input.provider === "kie-ai") {
    return resolveKieContinuityReference(previous, input.fieldName);
  }

  return {
    image: {
      url: previous.continuity_frame_url,
      fieldName: input.fieldName,
      role: "previous_last_frame",
    },
    metadata: {
      enabled: true,
      applied: true,
      sourceSegmentId: previous.id,
      sourceSegmentIndex: previous.segment_index,
      sourceFrameUrl: previous.continuity_frame_url,
      providerFrameUrl: previous.continuity_frame_url,
    },
  };
}

async function resolveKieContinuityReference(
  previous: OmniReelSegment,
  fieldName: string
): Promise<ContinuityReferenceResolution> {
  try {
    const kieUrl = previous.continuity_kie_file_url || (await uploadAndPersistKieFrame(previous));
    return {
      image: { url: kieUrl, fieldName, role: "previous_last_frame" },
      metadata: {
        enabled: true,
        applied: true,
        sourceSegmentId: previous.id,
        sourceSegmentIndex: previous.segment_index,
        sourceFrameUrl: previous.continuity_frame_url,
        providerFrameUrl: kieUrl,
        providerUpload: "kie_file_upload",
      },
    };
  } catch (error) {
    return {
      image: null,
      metadata: {
        enabled: true,
        applied: false,
        sourceSegmentId: previous.id,
        sourceSegmentIndex: previous.segment_index,
        sourceFrameUrl: previous.continuity_frame_url,
        reason: "kie_continuity_frame_upload_failed",
        error: error instanceof Error ? error.message : "KIE continuity frame upload failed",
      },
    };
  }
}

async function uploadAndPersistKieFrame(previous: OmniReelSegment) {
  if (!previous.continuity_frame_url) throw new Error("Previous segment has no continuity frame URL");
  const upload = await uploadKieContinuityFrameFromUrl({
    frameUrl: previous.continuity_frame_url,
    sourceSegmentIndex: previous.segment_index,
  });
  await pool.query(
    `UPDATE omni_reel_segments
     SET continuity_kie_file_url = $2,
         response_payload = COALESCE(response_payload, '{}'::jsonb) || $3::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      previous.id,
      upload.url,
      JSON.stringify({
        continuity_frame_kie_upload: upload.raw,
      }),
    ]
  );
  return upload.url;
}

function findPreviousSegment(segment: OmniReelSegment, segments: OmniReelSegment[]) {
  return segments.find((candidate) => candidate.segment_index === segment.segment_index - 1) || null;
}
