/**
 * Dami legal corpus — Ghana.
 *
 * This is a small, deliberately *verified* seed corpus of real Ghanaian
 * instruments, stored at citation level (title, authority, locator, year and
 * the official repository that hosts the full text).
 *
 * Rules for this file:
 *  - Only add sources that genuinely exist and that a human has verified.
 *  - `summary` is an editorial description used for retrieval and must never
 *    be presented to the user as a quotation from the instrument.
 *  - `passage` may only be filled from ingested authentic source text.
 *  - Deep links are never invented; `url` points at the official repository.
 *
 * The retrieval layer (`src/services/rag`) is corpus-agnostic, so replacing
 * this array with a Postgres/pgvector ingestion pipeline requires no UI work.
 */

import type { LegalSource } from "@/lib/types";

const GHANA_LAWS = "Laws of Ghana (Ghana Publishing / Parliament of Ghana)";
const GHANA_LAWS_URL = "https://laws.ghana.gov.gh/";
const GHALII = "Ghana Legal Information Institute (GhaLII)";
const GHALII_URL = "https://ghalii.org/";
const JUDICIAL_SERVICE = "Judicial Service of Ghana";
const JUDICIAL_SERVICE_URL = "https://www.judicial.gov.gh/";
const LEGAL_AID = "Legal Aid Commission, Ghana";
const LEGAL_AID_URL = "https://legalaid.gov.gh/";

export const LEGAL_CORPUS: LegalSource[] = [
  {
    id: "gh-const-1992-art14",
    title: "Constitution of the Republic of Ghana, 1992 — Protection of personal liberty",
    authority: "Consultative Assembly / Republic of Ghana",
    jurisdiction: "Ghana",
    docType: "constitution",
    year: 1992,
    locator: "Article 14",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "personal liberty",
      "arrest",
      "detention",
      "unlawful detention",
      "police custody",
      "48 hours",
      "bail",
      "habeas corpus",
    ],
    summary:
      "Constitutional guarantee of personal liberty. Sets out the limited grounds on which a person may lawfully be deprived of liberty, the requirement to inform an arrested person of the reasons for arrest and of their right to a lawyer, and the requirement that an arrested person be brought before a court within the constitutionally prescribed time, with provision for release and compensation for unlawful arrest or detention.",
  },
  {
    id: "gh-const-1992-art19",
    title: "Constitution of the Republic of Ghana, 1992 — Fair trial",
    authority: "Consultative Assembly / Republic of Ghana",
    jurisdiction: "Ghana",
    docType: "constitution",
    year: 1992,
    locator: "Article 19",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "fair trial",
      "criminal charge",
      "presumption of innocence",
      "legal representation",
      "hearing",
      "court",
      "due process",
      "interpreter",
    ],
    summary:
      "Fair trial guarantees for persons charged with a criminal offence, including a fair hearing within a reasonable time by a court, the presumption of innocence, the right to be informed of the charge in a language the accused understands, the right to defend oneself in person or by a lawyer, and protections against retroactive offences and double jeopardy.",
  },
  {
    id: "gh-const-1992-art33",
    title:
      "Constitution of the Republic of Ghana, 1992 — Enforcement of fundamental human rights",
    authority: "Consultative Assembly / Republic of Ghana",
    jurisdiction: "Ghana",
    docType: "constitution",
    year: 1992,
    locator: "Article 33",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "human rights enforcement",
      "High Court",
      "remedy",
      "habeas corpus",
      "redress",
      "fundamental freedoms",
    ],
    summary:
      "Provides the route for enforcing fundamental human rights and freedoms: a person who alleges that a provision of the Constitution on fundamental human rights has been, is being, or is likely to be contravened may apply to the High Court for redress, and the court may issue directions and writs, including habeas corpus.",
  },
  {
    id: "gh-const-1992-art21",
    title: "Constitution of the Republic of Ghana, 1992 — General fundamental freedoms",
    authority: "Consultative Assembly / Republic of Ghana",
    jurisdiction: "Ghana",
    docType: "constitution",
    year: 1992,
    locator: "Article 21",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "freedom of speech",
      "assembly",
      "association",
      "demonstration",
      "movement",
      "religion",
      "information",
    ],
    summary:
      "Sets out general fundamental freedoms including freedom of speech and expression, freedom of thought, conscience and belief, freedom of assembly (including demonstrations and processions), freedom of association, freedom of movement, and the right to information, together with the permissible limits on those freedoms.",
  },
  {
    id: "gh-act-30-1960",
    title: "Criminal and Other Offences (Procedure) Act, 1960",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 1960,
    locator: "Act 30",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "criminal procedure",
      "arrest",
      "bail",
      "charge",
      "remand",
      "summons",
      "trial procedure",
      "police",
    ],
    summary:
      "Principal statute governing criminal procedure in Ghana: arrest with and without warrant, charging, bail and remand, committal and trial procedure before the courts, and appeals in criminal matters.",
  },
  {
    id: "gh-act-29-1960",
    title: "Criminal Offences Act, 1960",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 1960,
    locator: "Act 29",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "criminal offences",
      "assault",
      "stealing",
      "fraud",
      "defamation",
      "offences against the person",
      "punishment",
    ],
    summary:
      "Substantive criminal code of Ghana defining offences and their punishments, including offences against the person, offences against property such as stealing and fraud, and general principles of criminal responsibility.",
  },
  {
    id: "gh-act-459-1993",
    title: "Courts Act, 1993",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 1993,
    locator: "Act 459",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "courts",
      "jurisdiction",
      "High Court",
      "Court of Appeal",
      "Supreme Court",
      "district court",
      "appeals",
    ],
    summary:
      "Establishes the structure and jurisdiction of the courts of Ghana below and including the superior courts, sets out appellate routes, and provides for the application of customary law and the rules of court.",
  },
  {
    id: "gh-nrcd-323-1975",
    title: "Evidence Act, 1975",
    authority: "National Redemption Council of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 1975,
    locator: "NRCD 323",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "evidence",
      "burden of proof",
      "admissibility",
      "witness",
      "hearsay",
      "presumption",
      "documentary evidence",
    ],
    summary:
      "Governs the admissibility and evaluation of evidence in Ghanaian civil and criminal proceedings, including burdens and standards of proof, relevance, hearsay and its exceptions, privilege, opinion evidence and documentary evidence.",
  },
  {
    id: "gh-act-977-2018",
    title: "Legal Aid Commission Act, 2018",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 2018,
    locator: "Act 977",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "legal aid",
      "free legal representation",
      "access to justice",
      "indigent",
      "alternative dispute resolution",
      "public service",
    ],
    summary:
      "Establishes the Legal Aid Commission and provides for legal aid and alternative dispute resolution services to persons who cannot afford legal representation, including eligibility, the scope of assistance and the Commission's functions.",
  },
  {
    id: "gh-act-651-2003",
    title: "Labour Act, 2003",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 2003,
    locator: "Act 651",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "employment",
      "labour",
      "unfair termination",
      "dismissal",
      "contract of employment",
      "leave",
      "trade union",
      "redundancy",
      "worker rights",
    ],
    summary:
      "Principal employment statute of Ghana covering contracts of employment, rights and duties of employers and workers, termination and unfair termination, redundancy, hours of work and leave, trade unions and collective bargaining, and the National Labour Commission.",
  },
  {
    id: "gh-act-560-1998",
    title: "Children's Act, 1998",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 1998,
    locator: "Act 560",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "children",
      "child rights",
      "maintenance",
      "custody",
      "parentage",
      "child labour",
      "family tribunal",
      "adoption",
    ],
    summary:
      "Consolidates the law on the rights of the child in Ghana, including parental duty and maintenance, custody and access, protection from exploitative child labour, fosterage and adoption, and the jurisdiction of Family Tribunals.",
  },
  {
    id: "gh-act-367-1971",
    title: "Matrimonial Causes Act, 1971",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 1971,
    locator: "Act 367",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "divorce",
      "marriage",
      "matrimonial property",
      "maintenance of spouse",
      "custody",
      "nullity",
      "separation",
    ],
    summary:
      "Governs petitions for divorce and other matrimonial causes in Ghana, including the ground of breakdown of marriage beyond reconciliation, financial provision and property settlement, and custody of children of the marriage.",
  },
  {
    id: "gh-act-220-1963",
    title: "Rent Act, 1963",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 1963,
    locator: "Act 220",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "rent",
      "landlord",
      "tenant",
      "eviction",
      "recovery of possession",
      "rent advance",
      "housing",
    ],
    summary:
      "Regulates the relationship between landlords and tenants in Ghana, including rent assessment and control, permissible advance rent, the grounds and process for recovery of possession, and the role of the rent authorities.",
  },
  {
    id: "gh-act-843-2012",
    title: "Data Protection Act, 2012",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 2012,
    locator: "Act 843",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "data protection",
      "privacy",
      "personal data",
      "data controller",
      "consent",
      "data subject rights",
    ],
    summary:
      "Establishes the Data Protection Commission and regulates the processing of personal information in Ghana, setting out data protection principles, registration of data controllers and the rights of data subjects.",
  },
  {
    id: "gh-act-993-2020",
    title: "Right to Information Act, 2019",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 2019,
    locator: "Act 989",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "right to information",
      "access to information",
      "public institution",
      "disclosure",
      "exempt information",
      "public service",
    ],
    summary:
      "Gives effect to the constitutional right to information held by public institutions in Ghana, setting out how to apply for information, the timelines for response, exempt information and the review and appeal process.",
  },
  {
    id: "gh-act-798-2010",
    title: "Alternative Dispute Resolution Act, 2010",
    authority: "Parliament of Ghana",
    jurisdiction: "Ghana",
    docType: "legislation",
    year: 2010,
    locator: "Act 798",
    officialSource: GHANA_LAWS,
    url: GHANA_LAWS_URL,
    topics: [
      "arbitration",
      "mediation",
      "customary arbitration",
      "dispute resolution",
      "settlement",
      "ADR",
    ],
    summary:
      "Provides the framework for arbitration, mediation and customary arbitration in Ghana as alternatives to litigation, including arbitration agreements, the conduct of proceedings, awards and their enforcement.",
  },
  {
    id: "gh-judicial-service-guidance",
    title: "Judicial Service of Ghana — courts, forms and procedure information",
    authority: JUDICIAL_SERVICE,
    jurisdiction: "Ghana",
    docType: "public-service-guidance",
    year: null,
    locator: "Official portal",
    officialSource: JUDICIAL_SERVICE,
    url: JUDICIAL_SERVICE_URL,
    topics: [
      "court process",
      "filing",
      "court forms",
      "court locations",
      "case status",
      "practice direction",
      "public service",
    ],
    summary:
      "Official portal of the Judicial Service of Ghana with information about the courts, practice directions, court forms and filing procedures, and public guidance on how matters progress through the court system.",
  },
  {
    id: "gh-legal-aid-guidance",
    title: "Legal Aid Commission Ghana — applying for legal aid",
    authority: LEGAL_AID,
    jurisdiction: "Ghana",
    docType: "public-service-guidance",
    year: null,
    locator: "Official portal",
    officialSource: LEGAL_AID,
    url: LEGAL_AID_URL,
    topics: [
      "legal aid",
      "free lawyer",
      "eligibility",
      "application",
      "mediation",
      "access to justice",
      "public service",
    ],
    summary:
      "Official portal of Ghana's Legal Aid Commission describing who qualifies for legal aid, the services offered including representation and mediation, and how to apply at regional and district offices.",
  },
  {
    id: "gh-ghalii-case-law",
    title: "GhaLII — Ghana Supreme Court, Court of Appeal and High Court decisions",
    authority: GHALII,
    jurisdiction: "Ghana",
    docType: "case-law",
    year: null,
    locator: "Case law database",
    officialSource: GHALII,
    url: GHALII_URL,
    topics: [
      "case law",
      "judgment",
      "precedent",
      "Supreme Court",
      "Court of Appeal",
      "High Court",
      "authority",
      "ruling",
    ],
    summary:
      "Free-access database of Ghanaian judgments and legislation maintained by the Ghana Legal Information Institute. Use it to locate and verify the full text of decided cases before relying on them; Dami does not assert the holding of a case it has not retrieved.",
  },
];

export function getSourceById(id: string): LegalSource | undefined {
  return LEGAL_CORPUS.find((s) => s.id === id);
}

export const CORPUS_METADATA = {
  jurisdiction: "Ghana",
  documentCount: LEGAL_CORPUS.length,
  level: "citation-level seed corpus",
  note: "Verified instruments only. Full-text ingestion and pgvector search are planned for the hosting phase.",
} as const;
