export type PhysicalActionKind =
  | "neutral_speech"
  | "touch_one_cheek"
  | "touch_both_cheeks"
  | "hands_to_face"
  | "consume"
  | "pick_up"
  | "put_down"
  | "handoff"
  | "driving"
  | "unknown";

export type PhysicalObjectState = "hidden" | "surface" | "held" | "visible" | "unknown";
export type PhysicalSpeechMode = "on_camera" | "voiceover_only" | "silent";

export type PhysicalFramePlan = {
  schemaVersion: "physical_frame_v1";
  actionKind: PhysicalActionKind;
  requiredHands: 0 | 1 | 2;
  occupiedHandCount: 0 | 1 | 2;
  speechMode: PhysicalSpeechMode;
  productState: PhysicalObjectState;
  visibleEntityIds: readonly string[];
  heldEntityIds: readonly string[];
};
