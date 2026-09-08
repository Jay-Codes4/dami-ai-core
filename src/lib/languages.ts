export type DamiLanguageCode = "en" | "ak" | "yo" | "sw" | "pcm";

export interface DamiLanguage {
  code: DamiLanguageCode;
  label: string;
  shortLabel: string;
  codeSwitched: boolean;
  ttsLanguage: string;
  preferredAccent: string;
}

/**
 * Deadline launch set. Sahara supports a wider African STT surface than its
 * current TTS catalogue. For speech output we map every launch language to an
 * accent/language pair that the Sahara TTS API actually supports today.
 */
export const DAMI_LANGUAGES: DamiLanguage[] = [
  {
    code: "en",
    label: "English",
    shortLabel: "English",
    codeSwitched: false,
    ttsLanguage: "en",
    preferredAccent: "yoruba",
  },
  {
    code: "ak",
    label: "Akan ↔ English",
    shortLabel: "Akan-English",
    codeSwitched: true,
    // Sahara TTS does not currently expose Akan/Twi output, so English uses a
    // supported West African English accent while STT can still handle Akan.
    ttsLanguage: "en",
    preferredAccent: "yoruba",
  },
  {
    code: "yo",
    label: "Yoruba ↔ English",
    shortLabel: "Yoruba-English",
    codeSwitched: true,
    ttsLanguage: "yo",
    preferredAccent: "yoruba",
  },
  {
    code: "sw",
    label: "Swahili ↔ English",
    shortLabel: "Swahili-English",
    codeSwitched: true,
    ttsLanguage: "sw",
    preferredAccent: "swahili",
  },
  {
    code: "pcm",
    label: "Nigerian Pidgin ↔ English",
    shortLabel: "Pidgin-English",
    codeSwitched: true,
    ttsLanguage: "pcm",
    preferredAccent: "pidgin",
  },
];

export const DEFAULT_DAMI_LANGUAGE: DamiLanguageCode = "en";

export function getDamiLanguage(code: string): DamiLanguage {
  return DAMI_LANGUAGES.find((language) => language.code === code) ?? DAMI_LANGUAGES[0];
}
