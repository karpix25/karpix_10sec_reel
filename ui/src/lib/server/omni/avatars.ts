import pool from "@/lib/db";
import { OmniClientAvatar } from "@/lib/omni/types";
import { requireAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { getOmniVoicePreset } from "@/lib/omni/omni-voice-profile";
import { ensureOmniSchema } from "./schema";
import { createKieOmniAudio, createKieOmniCharacter } from "./kie-omni-client";
import { selectOmniAvatarVoice } from "./omni-avatar-voice-selector";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getReadyKieCharacterId(avatar: Pick<OmniClientAvatar, "kie_character_id" | "kie_character_payload">) {
  const payload = avatar.kie_character_payload;
  const data =
    payload && typeof payload === "object" && !Array.isArray(payload) && "data" in payload
      ? (payload as { data?: unknown }).data
      : null;
  const characterId =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as { characterId?: unknown; character_id?: unknown }).characterId ||
        (data as { characterId?: unknown; character_id?: unknown }).character_id
      : null;
  if (typeof characterId === "string" && characterId.trim()) return characterId.trim();
  return cleanText(avatar.kie_character_id);
}

export async function listOmniClientAvatars(projectId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniClientAvatar>(
    `SELECT *
     FROM omni_client_avatars
     WHERE project_id = $1
     ORDER BY is_active DESC, updated_at DESC, id DESC
     LIMIT 20`,
    [projectId]
  );
  return rows;
}

export async function getLatestOmniClientAvatar(projectId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniClientAvatar>(
    `SELECT *
     FROM omni_client_avatars
     WHERE project_id = $1
       AND is_active = TRUE
       AND reference_url IS NOT NULL
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [projectId]
  );
  return rows[0] || null;
}

export async function createOmniClientAvatar(input: {
  projectId: number;
  displayName?: unknown;
  prompt: unknown;
  speechGender: unknown;
  referenceUrl?: unknown;
  status?: unknown;
  provider?: unknown;
  voicePresetId?: unknown;
}) {
  await ensureOmniSchema();
  const prompt = cleanText(input.prompt);
  if (!prompt) throw new Error("Avatar prompt is required");
  const speechGender = requireAvatarSpeechGender(input.speechGender);
  const displayName = cleanText(input.displayName);
  const status = cleanText(input.status) || "draft";
  const provider = cleanText(input.provider) || "gpt-image-2";
  const selectedVoice = await resolveAvatarVoice({
    displayName,
    prompt,
    speechGender,
    voicePresetId: input.voicePresetId,
  });

  const { rows } = await pool.query<OmniClientAvatar>(
    `INSERT INTO omni_client_avatars (
       project_id,
       display_name,
       prompt,
       speech_gender,
       voice_preset_id,
       voice_selection_source,
       reference_url,
       status,
       provider,
       is_active,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      input.projectId,
      displayName || null,
      prompt,
      speechGender,
      selectedVoice.preset.id,
      selectedVoice.source,
      cleanText(input.referenceUrl) || null,
      status,
      provider,
    ]
  );

  return rows[0];
}

export async function updateOmniClientAvatarStatus(input: {
  projectId: number;
  avatarId: number;
  status: unknown;
}) {
  await ensureOmniSchema();
  const status = cleanText(input.status);
  if (!status) throw new Error("Avatar status is required");

  if (status === "approved") {
    return approveOmniClientAvatar(input.projectId, input.avatarId);
  }

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET status = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [input.avatarId, input.projectId, status]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

async function approveOmniClientAvatar(projectId: number, avatarId: number) {
  const current = await getOmniClientAvatar(projectId, avatarId);
  if (!current.reference_url) throw new Error("Avatar reference image is required before approval");
  const speechGender = requireAvatarSpeechGender(current.speech_gender);
  const selectedVoice = await resolveAvatarVoice({
    displayName: current.display_name,
    prompt: current.prompt,
    speechGender,
    voicePresetId: current.voice_preset_id,
  });

  const readyCharacterId = getReadyKieCharacterId(current);
  if (
    readyCharacterId &&
    current.kie_character_status !== "queued" &&
    current.voice_preset_id === selectedVoice.preset.id &&
    cleanText(current.kie_audio_id)
  ) {
    return updateAvatarApproval({
      projectId,
      avatarId,
      kieCharacterId: readyCharacterId,
      kieCharacterStatus: current.kie_character_status || "ready",
      kieCharacterPayload: current.kie_character_payload,
      voicePresetId: selectedVoice.preset.id,
      voiceSelectionSource: selectedVoice.source,
      kieAudioId: current.kie_audio_id || "",
      kieAudioPayload: current.kie_audio_payload || {},
    });
  }

  const audio = cleanText(current.kie_audio_id) && current.voice_preset_id === selectedVoice.preset.id
    ? { id: current.kie_audio_id || "", raw: current.kie_audio_payload || {} }
    : await createKieOmniAudio({
        audioId: selectedVoice.preset.id,
        name: `${selectedVoice.preset.label} для ${current.display_name || `аватара ${current.id}`}`,
        voiceDescription: selectedVoice.preset.description,
        exampleDialogue: selectedVoice.preset.exampleDialogue,
      });

  const character = await createKieOmniCharacter({
    characterName: current.display_name || `Omni Avatar ${current.id}`,
    imageUrl: current.reference_url,
    description: current.prompt,
    audioIds: [audio.id],
  });

  return updateAvatarApproval({
    projectId,
    avatarId,
    kieCharacterId: character.character_id || "",
    kieCharacterStatus: character.status,
    kieCharacterPayload: character.raw,
    voicePresetId: selectedVoice.preset.id,
    voiceSelectionSource: selectedVoice.source,
    kieAudioId: audio.id,
    kieAudioPayload: audio.raw,
  });
}

async function resolveAvatarVoice(input: {
  displayName: string | null;
  prompt: string;
  speechGender: "female" | "male";
  voicePresetId?: unknown;
}) {
  const requestedPresetId = cleanText(input.voicePresetId);
  if (requestedPresetId) {
    const preset = getOmniVoicePreset(requestedPresetId);
    if (!preset) throw new Error("Unsupported avatar voice preset");
    if (preset.gender !== input.speechGender) {
      throw new Error("Avatar voice must match the selected speech gender");
    }
    return { preset, source: "manual" as const };
  }
  return selectOmniAvatarVoice({
    displayName: input.displayName,
    prompt: input.prompt,
    speechGender: input.speechGender,
  });
}

async function getOmniClientAvatar(projectId: number, avatarId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniClientAvatar>(
    `SELECT *
     FROM omni_client_avatars
     WHERE id = $1
       AND project_id = $2
     LIMIT 1`,
    [avatarId, projectId]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

async function updateAvatarApproval(input: {
  projectId: number;
  avatarId: number;
  kieCharacterId: string;
  kieCharacterStatus: string;
  kieCharacterPayload: Record<string, unknown> | null;
  voicePresetId: string;
  voiceSelectionSource: "llm" | "manual";
  kieAudioId: string;
  kieAudioPayload: Record<string, unknown>;
}) {
  if (!input.kieCharacterId) throw new Error("KIE.ai character create did not return characterId");

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET status = 'approved',
         voice_preset_id = $3,
         voice_selection_source = $4,
         kie_audio_id = $5,
         kie_audio_payload = $6::jsonb,
         kie_character_id = $7,
         kie_character_status = $8,
         kie_character_payload = $9::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [
      input.avatarId,
      input.projectId,
      input.voicePresetId,
      input.voiceSelectionSource,
      input.kieAudioId,
      JSON.stringify(input.kieAudioPayload),
      input.kieCharacterId,
      input.kieCharacterStatus,
      JSON.stringify(input.kieCharacterPayload),
    ]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

export async function updateOmniClientAvatarActive(input: {
  projectId: number;
  avatarId: number;
  isActive: unknown;
}) {
  await ensureOmniSchema();
  const isActive = Boolean(input.isActive);

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET is_active = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [input.avatarId, input.projectId, isActive]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

export async function updateOmniClientAvatarName(input: {
  projectId: number;
  avatarId: number;
  displayName: unknown;
}) {
  await ensureOmniSchema();
  const displayName = cleanText(input.displayName);

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET display_name = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [input.avatarId, input.projectId, displayName || null]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

export async function updateOmniClientAvatarSpeechGender(input: {
  projectId: number;
  avatarId: number;
  speechGender: unknown;
}) {
  await ensureOmniSchema();
  const speechGender = requireAvatarSpeechGender(input.speechGender);
  const current = await getOmniClientAvatar(input.projectId, input.avatarId);
  const selectedVoice = await resolveAvatarVoice({
    displayName: current.display_name,
    prompt: current.prompt,
    speechGender,
  });

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET speech_gender = $3,
         voice_preset_id = $4,
         voice_selection_source = $5,
         status = 'draft',
         kie_audio_id = NULL,
         kie_audio_payload = NULL,
         kie_character_id = NULL,
         kie_character_status = NULL,
         kie_character_payload = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [input.avatarId, input.projectId, speechGender, selectedVoice.preset.id, selectedVoice.source]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

export async function updateOmniClientAvatarVoice(input: {
  projectId: number;
  avatarId: number;
  voicePresetId?: unknown;
}) {
  await ensureOmniSchema();
  const current = await getOmniClientAvatar(input.projectId, input.avatarId);
  const speechGender = requireAvatarSpeechGender(current.speech_gender);
  const selectedVoice = await resolveAvatarVoice({
    displayName: current.display_name,
    prompt: current.prompt,
    speechGender,
    voicePresetId: input.voicePresetId,
  });

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET voice_preset_id = $3,
         voice_selection_source = $4,
         status = 'draft',
         kie_audio_id = NULL,
         kie_audio_payload = NULL,
         kie_character_id = NULL,
         kie_character_status = NULL,
         kie_character_payload = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [input.avatarId, input.projectId, selectedVoice.preset.id, selectedVoice.source]
  );
  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

export async function deleteOmniClientAvatar(input: { projectId: number; avatarId: number }) {
  await ensureOmniSchema();
  const { rowCount } = await pool.query(
    `DELETE FROM omni_client_avatars
     WHERE id = $1
       AND project_id = $2`,
    [input.avatarId, input.projectId]
  );
  if (!rowCount) throw new Error("Avatar was not found");
}
