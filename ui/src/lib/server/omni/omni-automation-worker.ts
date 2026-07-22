import { createGeneratedScriptFromLegacy } from "./generated-scripts";
import {
  claimNextOmniAutomationJob,
  completeOmniAutomationJob,
  failOmniAutomationJob,
  requeueOmniAutomationJob,
  updateOmniAutomationJobStage,
  type OmniAutomationJob,
} from "./omni-automation-queue";
import { submitOmniReel, syncOmniReel } from "./omni-reel-runner";
import { createOmniReel } from "./reels";
import { ensureOmniSchema } from "./schema";

function envInt(name: string, fallback: number, min = 1) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown Omni automation error");
}

function getRetryDelaySeconds(job: OmniAutomationJob) {
  const base = envInt("OMNI_AUTOMATION_RETRY_BASE_SECONDS", 60);
  const max = envInt("OMNI_AUTOMATION_RETRY_MAX_SECONDS", 1800);
  const attemptPower = Math.max(0, job.attempt_count - 1);
  return Math.min(max, base * 2 ** attemptPower);
}

async function handleJobError(job: OmniAutomationJob, error: unknown) {
  const message = getErrorMessage(error);
  if (job.attempt_count >= job.max_attempts) {
    return {
      action: "failed",
      job: await failOmniAutomationJob({ jobId: job.id, errorMessage: message }),
      error: message,
    };
  }

  return {
    action: "requeued",
    job: await requeueOmniAutomationJob({
      jobId: job.id,
      delaySeconds: getRetryDelaySeconds(job),
      errorMessage: message,
    }),
    error: message,
  };
}

async function runScriptStage(job: OmniAutomationJob) {
  if (job.generated_script_id) {
    return updateOmniAutomationJobStage({ jobId: job.id, stage: "reel" });
  }

  const script = await createGeneratedScriptFromLegacy({
    projectId: job.project_id,
    productId: job.product_id,
    legacyScenarioId: job.source_legacy_scenario_id,
  });
  return updateOmniAutomationJobStage({
    jobId: job.id,
    stage: "reel",
    generatedScriptId: script.id,
  });
}

async function runReelStage(job: OmniAutomationJob) {
  if (job.reel_id) {
    return updateOmniAutomationJobStage({ jobId: job.id, stage: "submit" });
  }
  if (!job.generated_script_id) {
    throw new Error("Omni automation job has no generated script for reel stage");
  }

  const reel = await createOmniReel({
    projectId: job.project_id,
    productId: job.product_id,
    sourceGeneratedScriptId: job.generated_script_id,
    sourceLegacyScenarioId: job.source_legacy_scenario_id,
  });
  return updateOmniAutomationJobStage({
    jobId: job.id,
    stage: "submit",
    reelId: reel.id,
  });
}

async function runSubmitStage(job: OmniAutomationJob) {
  if (!job.reel_id) {
    throw new Error("Omni automation job has no reel for submit stage");
  }
  await submitOmniReel(job.reel_id, job.generation_provider);
  return requeueOmniAutomationJob({
    jobId: job.id,
    stage: "sync",
    delaySeconds: envInt("OMNI_AUTOMATION_SYNC_POLL_SECONDS", 30),
  });
}

async function runSyncStage(job: OmniAutomationJob) {
  if (!job.reel_id) {
    throw new Error("Omni automation job has no reel for sync stage");
  }

  const bundle = await syncOmniReel(job.reel_id);
  if (bundle.reel.status === "completed" && bundle.reel.final_video_url) {
    return completeOmniAutomationJob(job.id);
  }
  if (bundle.reel.status === "failed") {
    throw new Error(bundle.reel.error_message || "Omni reel failed");
  }

  return requeueOmniAutomationJob({
    jobId: job.id,
    stage: "sync",
    delaySeconds: envInt("OMNI_AUTOMATION_SYNC_POLL_SECONDS", 30),
  });
}

export async function processNextOmniAutomationJob(input?: { workerId?: string }) {
  await ensureOmniSchema();
  let job = await claimNextOmniAutomationJob({
    workerId: input?.workerId || `omni-worker-${process.pid}`,
    leaseSeconds: envInt("OMNI_AUTOMATION_WORKER_LEASE_SECONDS", 1800, 60),
    perProjectConcurrency: envInt("OMNI_AUTOMATION_PER_PROJECT_CONCURRENCY", 1),
  });
  if (!job) {
    return { processed: false, reason: "idle" };
  }

  try {
    if (job.current_stage === "script") job = await runScriptStage(job);
    if (job.current_stage === "reel") job = await runReelStage(job);
    if (job.current_stage === "submit") {
      const queued = await runSubmitStage(job);
      return { processed: true, action: "waiting", job: queued };
    }
    if (job.current_stage === "sync") {
      const synced = await runSyncStage(job);
      return { processed: true, action: synced.status, job: synced };
    }

    return { processed: true, action: "advanced", job };
  } catch (error) {
    return { processed: true, ...(await handleJobError(job, error)) };
  }
}
