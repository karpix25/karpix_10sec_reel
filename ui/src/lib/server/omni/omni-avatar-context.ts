import type { OmniClientAvatar } from "@/lib/omni/types";
import { resolveNarratorSpeechGender, type OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { isFacelessReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "./omni-reference-scene-mode";

export function resolveOmniAvatarContext(input: {
  avatar: OmniClientAvatar | null;
  directorBrief: unknown;
}) {
  const referenceSceneMode = resolveReferenceSceneMode(input.directorBrief);
  const facelessReferenceScene = isFacelessReferenceScene(referenceSceneMode);
  return {
    referenceSceneMode,
    facelessReferenceScene,
    avatarForPrompt: facelessReferenceScene ? null : input.avatar,
    speechGender: resolveNarratorSpeechGender(input.avatar?.speech_gender, facelessReferenceScene),
  } satisfies {
    referenceSceneMode: ReferenceSceneMode;
    facelessReferenceScene: boolean;
    avatarForPrompt: OmniClientAvatar | null;
    speechGender: OmniAvatarSpeechGender;
  };
}
