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
 * Deadline launch set. Sahara supports a wider African language surface; we
 * intentionally start with a small set that can be tested thoroughly before
 * submission and expand after the challenge.
 */
export const DAMI_LANGUAGES: DamiLanguage[] = [
  {
    code: "en",
    label: "English — African accent",
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
    ttsLanguage: "en",
    preferredAccent: "yoruba",
  },
];

export const DEFAULT_DAMI_LANGUAGE: DamiLanguageCode = "en";

export function getDamiLanguage(code: string): DamiLanguage {
  return DAMI_LANGUAGES.find((language) => language.code === code) ?? DAMI_LANGUAGES[0];
}
