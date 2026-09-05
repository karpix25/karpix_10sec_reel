import type { StoryboardFrameRole } from "./llm-prompt-chain-types";
import type { ReferenceSegmentBeat } from "./reference-segment-plan";

type ReferenceSourceFrameInput = {
  beat: ReferenceSegmentBeat;
  currentRole: StoryboardFrameRole;
  currentAction: string;
  currentCamera: string;
  currentVisualDescription: string;
  frameIndex: number;
  frameCount: number;
  productVisible: boolean;
  avatarIntro: boolean;
  presenterSource: boolean;
  brollSource: boolean;
};

export function repairReferenceSourceFrame(input: ReferenceSourceFrameInput) {
  if (input.productVisible || input.avatarIntro) {
    return {
      role: input.avatarIntro ? "face_open" as const : input.currentRole,
      action: input.currentAction,
      camera: input.currentCamera,
      visualDescription: input.currentVisualDescription,
    };
  }

  if (input.presenterSource) {
    return {
      role: input.frameIndex === input.frameCount - 1 ? "face_return" as const : "face_open" as const,
      action: renderPresenterAction(input.beat, input.currentAction),
      camera: input.beat.camera || input.currentCamera,
      visualDescription: renderPresenterVisual(input.beat),
    };
  }

  if (input.brollSource) {
    return {
      role: "environment_cutaway" as const,
      action: "Independent source B-roll follows the verified cut and camera motion; no face or presenter in frame.",
      camera: input.beat.camera || input.currentCamera,
      visualDescription: `Independent source B-roll in ${renderSourceContext(input.beat)}; no face or presenter in frame.`,
    };
  }

  return {
    role: input.currentRole,
    action: input.currentAction,
    camera: input.currentCamera,
    visualDescription: input.currentVisualDescription,
  };
}

function renderPresenterAction(beat: ReferenceSegmentBeat, fallback: string) {
  const action = [beat.action, beat.gesture].filter(Boolean).join("; ") || fallback;
  return `The approved avatar delivers the line on camera with the verified source action: ${action}`;
}

function renderPresenterVisual(beat: ReferenceSegmentBeat) {
  return `Approved avatar as the on-camera presenter in ${renderSourceContext(beat)}.`;
}

function renderSourceContext(beat: ReferenceSegmentBeat) {
  return [beat.setting, beat.environment, beat.lighting].filter(Boolean).join("; ") || "the verified source setting";
}
