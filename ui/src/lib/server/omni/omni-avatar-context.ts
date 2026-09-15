import type { OmniClientAvatar } from "@/lib/omni/types";
import { resolveNarratorSpeechGender, type OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";

export function resolveOmniAvatarContext(input: {
  avatar: OmniClientAvatar | null;
  directorBrief: unknown;
}) {
  // Omni reels always have a visible avatar narrator. The reference can guide
  // styling and edit rhythm, but it cannot remove the saved avatar from the reel.
  const referenceSceneMode: ReferenceSceneMode = "presenter";
  const facelessReferenceScene = false;
  const avatarFreeReferenceScene = false;
  return {
    referenceSceneMode,
    facelessReferenceScene,
    avatarFreeReferenceScene,
    avatarForPrompt: avatarFreeReferenceScene ? null : input.avatar,
    speechGender: resolveNarratorSpeechGender(input.avatar?.speech_gender, avatarFreeReferenceScene),
  } satisfies {
    referenceSceneMode: ReferenceSceneMode;
    facelessReferenceScene: boolean;
    avatarFreeReferenceScene: boolean;
    avatarForPrompt: OmniClientAvatar | null;
    speechGender: OmniAvatarSpeechGender;
  };
}
