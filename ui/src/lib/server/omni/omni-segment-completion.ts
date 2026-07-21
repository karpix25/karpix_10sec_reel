import pool from "@/lib/db";
import { rm } from "fs/promises";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import { stitchOmniSegments } from "./omni-video-stitcher";
import { uploadOmniFinalVideo, uploadOmniVideoBufferToS3 } from "./omni-video-storage";
import { createContinuityFrameAsset } from "./omni-frame-continuity";
import { downloadProviderVideo, type ProviderTask } from "./omni-provider-tasks";
import { startOmniReelSubtitlesIfEnabled } from "./omni-reel-subtitles";
import { mixBackgroundAudioForReel } from "./omni-background-audio";

export async function storeCompletedSegment(input: {
  projectId: number;
  segment: OmniReelSegment;
  task: ProviderTask;
}) {
  if (!input.segment.kie_task_id) {
    throw new Error(`Segment ${input.segment.segment_index} has no Omni task id`);
  }

  const provider = normalizeOmniGenerationProvider(input.segment.generation_provider);
  const videoBuffer = await downloadProviderVideo(provider, input.segment.kie_task_id);
  const videoUrl = await uploadOmniVideoBufferToS3({
    projectId: input.projectId,
    reelId: input.segment.reel_id,
    fileName: `segment_${String(input.segment.segment_index).padStart(2, "0")}.mp4`,
    body: videoBuffer,
    segmentIndex: input.segment.segment_index,
  });
  const continuity = await tryCreateContinuityFrame({
    projectId: input.projectId,
    segment: input.segment,
    videoBuffer,
  });
  const responsePayload = {
    ...input.task.raw,
    continuity_frame: continuity.payload,
  };

  await pool.query(
    `UPDATE omni_reel_segments
     SET status = 'completed',
         video_url = $2,
         response_payload = $3::jsonb,
         continuity_frame_url = $4,
         continuity_kie_file_url = $5,
         completed_at = CURRENT_TIMESTAMP,
         error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      input.segment.id,
      videoUrl,
      JSON.stringify(responsePayload),
      continuity.frameUrl,
      continuity.kieFrameUrl,
    ]
  );
}

export async function stitchAndStoreReel(input: {
  reel: OmniReel;
  segments: OmniReelSegment[];
}) {
  const project = await getOmniProject(input.reel.project_id);
  if (!project) throw new Error("Omni project not found");
  const product = await requireOmniProductInProject(input.reel.project_id, input.reel.product_id);

  await pool.query(
    "UPDATE omni_reels SET status = 'stitching', stitch_status = 'stitching', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [input.reel.id]
  );

  const segmentBuffers = await Promise.all(input.segments.map(loadSegmentBuffer));
  const stitched = await stitchOmniSegments({ reelId: input.reel.id, segmentBuffers });
  try {
    const audio = await tryMixBackgroundAudio({
      reel: input.reel,
      sourceVideoPath: stitched.outputPath,
      workdir: stitched.workdir,
    });
    const stored = await uploadOmniFinalVideo({
      project,
      product,
      reelId: input.reel.id,
      localFilePath: audio.outputPath,
    });

    await pool.query(
      `UPDATE omni_reels
       SET status = $2,
           stitch_status = 'completed',
           final_video_url = $3,
           final_s3_url = $3,
           yandex_disk_path = $4,
           yandex_public_url = $5,
           yandex_status = $6,
           yandex_error = $7,
           background_audio_track_id = $8,
           background_audio_status = $9,
           background_audio_url = $10,
           background_audio_error = $11,
           background_audio_track_snapshot = $12::jsonb,
           subtitles_status = 'not_requested',
           subtitled_video_url = NULL,
           subtitles_error = NULL,
           subtitles_transcript = NULL,
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        input.reel.id,
        "completed",
        stored.s3Url,
        stored.yandexPath,
        stored.yandexPublicUrl,
        stored.yandexStatus,
        stored.yandexError,
        audio.track?.id || null,
        audio.status,
        audio.track?.file_url || null,
        audio.error,
        audio.track ? JSON.stringify(audio.track) : null,
      ]
    );
    await startOmniReelSubtitlesIfEnabled({ reelId: input.reel.id });
  } finally {
    if (stitched?.workdir) {
      await rm(stitched.workdir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function tryMixBackgroundAudio(input: {
  reel: OmniReel;
  sourceVideoPath: string;
  workdir: string;
}) {
  await pool.query(
    `UPDATE omni_reels
     SET background_audio_status = 'mixing',
         background_audio_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [input.reel.id]
  );

  try {
    const result = await mixBackgroundAudioForReel({
      reelId: input.reel.id,
      mood: input.reel.background_audio_mood,
      sourceVideoPath: input.sourceVideoPath,
      workdir: input.workdir,
    });
    return {
      outputPath: result.outputPath,
      status: result.status,
      track: result.track,
      error: result.status === "skipped" ? result.reason : null,
    };
  } catch (error) {
    return {
      outputPath: input.sourceVideoPath,
      status: "failed" as const,
      track: null,
      error: error instanceof Error ? error.message : "Background audio mix failed",
    };
  }
}

async function loadSegmentBuffer(segment: OmniReelSegment) {
  if (!segment.video_url) throw new Error(`Segment ${segment.segment_index} video is missing`);
  const response = await fetch(segment.video_url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load segment ${segment.segment_index} from S3: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function tryCreateContinuityFrame(input: {
  projectId: number;
  segment: OmniReelSegment;
  videoBuffer: Buffer;
}) {
  try {
    const asset = await createContinuityFrameAsset({
      projectId: input.projectId,
      reelId: input.segment.reel_id,
      sourceSegmentId: input.segment.id,
      sourceSegmentIndex: input.segment.segment_index,
      videoBuffer: input.videoBuffer,
      uploadForKie: false,
    });
    return {
      frameUrl: asset.sourceFrameUrl,
      kieFrameUrl: asset.kieFrameUrl,
      payload: {
        status: "completed",
        sourceSegmentId: asset.sourceSegmentId,
        sourceSegmentIndex: asset.sourceSegmentIndex,
        sourceFrameUrl: asset.sourceFrameUrl,
        kieFrameUrl: asset.kieFrameUrl,
      },
    };
  } catch (error) {
    return {
      frameUrl: null,
      kieFrameUrl: null,
      payload: {
        status: "failed",
        error: error instanceof Error ? error.message : "Continuity frame extraction failed",
      },
    };
  }
}
