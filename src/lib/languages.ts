export type DamiLanguageCode = "en" | "ak" | "yo" | "sw" | "ig" | "pcm";

export interface DamiLanguage {
  code: DamiLanguageCode;
  label: string;
  shortLabel: string;
  codeSwitched: boolean;
  saharaSttLanguage: "en" | "ak" | "yo" | "sw" | "ig" | "pcm";
  expectedLanguages: readonly string[];
  ttsLanguage: "en" | "yo" | "sw" | "ig" | "pcm";
  preferredAccent: "yoruba" | "swahili" | "igbo" | "pidgin";
}

/**
 * Keep Dami's original launch languages and add Igbo for the competition.
 * The visible selector must not be narrowed just because the benchmark focuses
 * on English, Igbo and Nigerian Pidgin.
 */
export const DAMI_LANGUAGES: DamiLanguage[] = [
  {
    code: "en",
    label: "English",
    shortLabel: "English",
    codeSwitched: false,
    saharaSttLanguage: "en",
    expectedLanguages: ["English"],
    ttsLanguage: "en",
    preferredAccent: "yoruba",
  },
  {
    code: "ak",
    label: "Akan ↔ English",
    shortLabel: "Akan-English",
    codeSwitched: true,
    saharaSttLanguage: "ak",
    expectedLanguages: ["Akan", "English"],
    // Sahara TTS does not expose Akan output here, so keep the proven
    // West African English voice fallback while preserving Akan STT.
    ttsLanguage: "en",
    preferredAccent: "yoruba",
  },
  {
    code: "yo",
    label: "Yoruba ↔ English",
    shortLabel: "Yoruba-English",
    codeSwitched: true,
    saharaSttLanguage: "yo",
    expectedLanguages: ["Yoruba", "English"],
    ttsLanguage: "yo",
    preferredAccent: "yoruba",
  },
  {
    code: "sw",
    label: "Swahili ↔ English",
    shortLabel: "Swahili-English",
    codeSwitched: true,
    saharaSttLanguage: "sw",
    expectedLanguages: ["Swahili", "English"],
    ttsLanguage: "sw",
    preferredAccent: "swahili",
  },
  {
    code: "ig",
    label: "Igbo ↔ English",
    shortLabel: "Igbo-English",
    codeSwitched: true,
    saharaSttLanguage: "ig",
    expectedLanguages: ["Igbo", "English"],
    ttsLanguage: "ig",
    preferredAccent: "igbo",
  },
  {
    code: "pcm",
    label: "Nigerian Pidgin ↔ English",
    shortLabel: "Pidgin-English",
    codeSwitched: true,
    saharaSttLanguage: "pcm",
    expectedLanguages: ["Nigerian Pidgin", "English"],
    ttsLanguage: "pcm",
    preferredAccent: "pidgin",
  },
];

export const DEFAULT_DAMI_LANGUAGE: DamiLanguageCode = "en";

export function isDamiLanguageCode(value: unknown): value is DamiLanguageCode {
  return (
    value === "en" ||
    value === "ak" ||
    value === "yo" ||
    value === "sw" ||
    value === "ig" ||
    value === "pcm"
  );
}

export function getDamiLanguage(code: string): DamiLanguage {
  return DAMI_LANGUAGES.find((language) => language.code === code) ?? DAMI_LANGUAGES[0]!;
}
