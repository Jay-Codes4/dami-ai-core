export type DamiLanguageCode = "en" | "ig" | "pcm";

export interface DamiLanguage {
  code: DamiLanguageCode;
  label: string;
  shortLabel: string;
  codeSwitched: boolean;
  saharaSttLanguage: "en" | "ig" | "pcm";
  expectedLanguages: readonly string[];
  ttsLanguage: "en" | "ig" | "pcm";
  preferredAccent: "yoruba" | "igbo" | "pidgin";
}

/**
 * Competition language scope. Sahara publishes `en` for English, `ig` for
 * Igbo-English code-switching, and `pcm` for Pidgin-English code-switching.
 * Sahara does not document a generic AUTO code, so Dami does not invent one.
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
    code: "ig",
    label: "Igbo",
    shortLabel: "Igbo + English",
    codeSwitched: true,
    saharaSttLanguage: "ig",
    expectedLanguages: ["Igbo", "English"],
    ttsLanguage: "ig",
    preferredAccent: "igbo",
  },
  {
    code: "pcm",
    label: "Nigerian Pidgin",
    shortLabel: "Pidgin + English",
    codeSwitched: true,
    saharaSttLanguage: "pcm",
    expectedLanguages: ["Nigerian Pidgin", "English"],
    ttsLanguage: "pcm",
    preferredAccent: "pidgin",
  },
];

export const DEFAULT_DAMI_LANGUAGE: DamiLanguageCode = "en";

export function isDamiLanguageCode(value: unknown): value is DamiLanguageCode {
  return value === "en" || value === "ig" || value === "pcm";
}

export function getDamiLanguage(code: string): DamiLanguage {
  return DAMI_LANGUAGES.find((language) => language.code === code) ?? DAMI_LANGUAGES[0]!;
}
