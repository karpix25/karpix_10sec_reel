import { OMNI_VOICE_PRESETS } from "@/lib/omni/omni-voice-profile";
import type { OmniAvatarSpeechGender } from "@/lib/omni/avatar-speech-gender";

type AvatarVoiceControlProps = {
  value: string;
  speechGender: OmniAvatarSpeechGender;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function AvatarVoiceControl({
  value,
  speechGender,
  onChange,
  disabled = false,
  compact = false,
}: AvatarVoiceControlProps) {
  const options = OMNI_VOICE_PRESETS.filter((preset) => preset.gender === speechGender);
  return (
    <label className={compact ? "block text-xs" : "mt-4 block text-sm"}>
      <span className="font-semibold text-foreground">Озвучка аватара</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Автовыбор LLM</option>
        {options.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
        LLM выбирает голос автоматически, если здесь не задан ручной выбор.
      </span>
    </label>
  );
}
