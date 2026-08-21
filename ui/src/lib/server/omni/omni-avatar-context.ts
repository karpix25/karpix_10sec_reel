import type { OmniClientAvatar } from "@/lib/omni/types";
import { resolveNarratorSpeechGender, type OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { isAvatarFreeReferenceScene, isFacelessReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "./omni-reference-scene-mode";

export function resolveOmniAvatarContext(input: {
  avatar: OmniClientAvatar | null;
  directorBrief: unknown;
}) {
  const referenceSceneMode = resolveReferenceSceneMode(input.directorBrief);
  const facelessReferenceScene = isFacelessReferenceScene(referenceSceneMode);
  const avatarFreeReferenceScene = isAvatarFreeReferenceScene(referenceSceneMode);
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
