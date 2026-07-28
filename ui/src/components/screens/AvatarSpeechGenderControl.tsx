"use client";

import { Mars, Venus } from "lucide-react";
import {
  getAvatarSpeechGenderLabel,
  OMNI_AVATAR_SPEECH_GENDERS,
  type OmniAvatarSpeechGender,
} from "@/lib/omni/avatar-speech-gender";

type AvatarSpeechGenderControlProps = {
  value: OmniAvatarSpeechGender | null;
  onChange: (value: OmniAvatarSpeechGender) => void;
  disabled?: boolean;
  idPrefix?: string;
  compact?: boolean;
};

export function AvatarSpeechGenderControl({
  value,
  onChange,
  disabled = false,
  idPrefix = "avatar-speech-gender",
  compact = false,
}: AvatarSpeechGenderControlProps) {
  return (
    <div className={compact ? "mt-2" : "mt-4"}>
      <p
        className={
          compact ? "text-xs font-semibold text-muted-foreground" : "text-sm font-semibold text-foreground"
        }
      >
        Род речи
      </p>
      <div
        className={`mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/25 p-1 ${
          compact ? "gap-1" : ""
        }`}
      >
        {OMNI_AVATAR_SPEECH_GENDERS.map((gender) => {
          const Icon = gender === "male" ? Mars : Venus;
          const isSelected = value === gender;
          return (
            <button
              key={gender}
              id={`${idPrefix}-${gender}`}
              type="button"
              onClick={() => onChange(gender)}
              disabled={disabled}
              className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                compact ? "h-8 px-2 text-xs" : "h-10 px-3 text-sm"
              } ${
                isSelected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              }`}
              aria-pressed={isSelected}
            >
              <Icon className="h-4 w-4" />
              {getAvatarSpeechGenderLabel(gender)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
