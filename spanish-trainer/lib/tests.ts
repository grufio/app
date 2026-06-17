import type { VocabItem } from "./types";
import type { McItem, McTopic } from "./mc";
import type { UserId } from "./user";
import { unidad5 } from "@/data/unidad5";
import { wortarten } from "@/data/deutsch/wortarten";
import { satzglieder } from "@/data/deutsch/satzglieder";
import { aktivPassiv } from "@/data/deutsch/aktiv-passiv";
import { tempus } from "@/data/deutsch/tempus";
import { attribute } from "@/data/deutsch/attribute";
import { feldermodell } from "@/data/deutsch/feldermodell";
import { optLicht } from "@/data/physik/opt-licht";
import { optSpiegel } from "@/data/physik/opt-spiegel";
import { optLinsen } from "@/data/physik/opt-linsen";
import { optFarben } from "@/data/physik/opt-farben";
import { akuSchall } from "@/data/physik/aku-schall";
import { akuTon } from "@/data/physik/aku-ton";
import { akuHoeren } from "@/data/physik/aku-hoeren";
import { strGrundlagen } from "@/data/physik/str-grundlagen";
import { strSchaltungen } from "@/data/physik/str-schaltungen";
import { strWirkungen } from "@/data/physik/str-wirkungen";
import { magPole } from "@/data/physik/mag-pole";
import { magFeld } from "@/data/physik/mag-feld";
import { magElektro } from "@/data/physik/mag-elektro";
import { grsGroessen } from "@/data/physik/grs-groessen";
import { grsMessen } from "@/data/physik/grs-messen";

interface TestBase {
  id: string;
  title: string;
  subtitle: string;
  /** Which profiles see this test on the overview. */
  users: UserId[];
}

/**
 * A test is either the translation-based vocabulary game (`vocab`) or a curated
 * multiple-choice quiz (`mc`). The overview filters by the active profile via
 * `users`; mc tests also carry `area` (the broad topic) so the overview can
 * group its sub-areas under one heading.
 */
export type TestDef =
  | (TestBase & { kind: "vocab"; items: VocabItem[] })
  | (TestBase & { kind: "mc"; area: McTopic; items: McItem[] });

const PHYSIK: UserId[] = ["r"];
const DEUTSCH: UserId[] = ["r"];

/** Registry of available tests. Physics is grouped by `area` into sub-areas. */
export const TESTS: TestDef[] = [
  {
    kind: "vocab",
    id: "unidad5",
    title: "Unidad 5",
    subtitle: "Wortschatz & Konjugationen",
    users: ["q"],
    items: unidad5,
  },

  // Optik
  { kind: "mc", area: "Optik", id: "opt-licht", title: "Licht, Schatten & Sehen", subtitle: "Optik", users: PHYSIK, items: optLicht },
  { kind: "mc", area: "Optik", id: "opt-spiegel", title: "Reflexion & Spiegel", subtitle: "Optik", users: PHYSIK, items: optSpiegel },
  { kind: "mc", area: "Optik", id: "opt-linsen", title: "Brechung & Linsen", subtitle: "Optik", users: PHYSIK, items: optLinsen },
  { kind: "mc", area: "Optik", id: "opt-farben", title: "Farben & Sehen", subtitle: "Optik", users: PHYSIK, items: optFarben },

  // Akustik
  { kind: "mc", area: "Akustik", id: "aku-schall", title: "Schall & Ausbreitung", subtitle: "Akustik", users: PHYSIK, items: akuSchall },
  { kind: "mc", area: "Akustik", id: "aku-ton", title: "Tonhöhe & Lautstärke", subtitle: "Akustik", users: PHYSIK, items: akuTon },
  { kind: "mc", area: "Akustik", id: "aku-hoeren", title: "Hören & Lärm", subtitle: "Akustik", users: PHYSIK, items: akuHoeren },

  // Elektrischer Stromkreis
  { kind: "mc", area: "Stromkreis", id: "str-grundlagen", title: "Stromkreis-Grundlagen", subtitle: "Elektrischer Stromkreis", users: PHYSIK, items: strGrundlagen },
  { kind: "mc", area: "Stromkreis", id: "str-schaltungen", title: "Schaltungen", subtitle: "Elektrischer Stromkreis", users: PHYSIK, items: strSchaltungen },
  { kind: "mc", area: "Stromkreis", id: "str-wirkungen", title: "Wirkungen & Sicherheit", subtitle: "Elektrischer Stromkreis", users: PHYSIK, items: strWirkungen },

  // Magnetismus
  { kind: "mc", area: "Magnetismus", id: "mag-pole", title: "Magnete & Pole", subtitle: "Magnetismus", users: PHYSIK, items: magPole },
  { kind: "mc", area: "Magnetismus", id: "mag-feld", title: "Magnetfeld & Kompass", subtitle: "Magnetismus", users: PHYSIK, items: magFeld },
  { kind: "mc", area: "Magnetismus", id: "mag-elektro", title: "Elektromagnetismus", subtitle: "Magnetismus", users: PHYSIK, items: magElektro },

  // Größen & Messen
  { kind: "mc", area: "Größen", id: "grs-groessen", title: "Größen & Einheiten", subtitle: "Größen & Messen", users: PHYSIK, items: grsGroessen },
  { kind: "mc", area: "Größen", id: "grs-messen", title: "Messen & Auswerten", subtitle: "Größen & Messen", users: PHYSIK, items: grsMessen },

  // Deutsch — Grammatikthemen (eine Fragenrunde je Thema)
  { kind: "mc", area: "Wortarten", id: "deu-wortarten", title: "Wortarten", subtitle: "Nomen, Verben, Adjektive …", users: DEUTSCH, items: wortarten },
  { kind: "mc", area: "Satzglieder", id: "deu-satzglieder", title: "Satzglieder", subtitle: "Subjekt, Prädikat, Objekte", users: DEUTSCH, items: satzglieder },
  { kind: "mc", area: "Aktiv/Passiv", id: "deu-aktiv-passiv", title: "Aktiv / Passiv", subtitle: "Handlung vs. Vorgang", users: DEUTSCH, items: aktivPassiv },
  { kind: "mc", area: "Tempus", id: "deu-tempus", title: "Tempus", subtitle: "Die Zeitformen", users: DEUTSCH, items: tempus },
  { kind: "mc", area: "Attribute", id: "deu-attribute", title: "Attribute", subtitle: "Beifügungen zum Nomen", users: DEUTSCH, items: attribute },
  { kind: "mc", area: "Feldermodell", id: "deu-feldermodell", title: "Feldermodell", subtitle: "Vorfeld, Satzklammer, Mittelfeld", users: DEUTSCH, items: feldermodell },
];

/** Resolve a test by id, falling back to the first test. */
export function testById(id: string | null | undefined): TestDef {
  return TESTS.find((test) => test.id === id) ?? TESTS[0];
}

/** A subject groups several areas on the overview (e.g. Physik, Deutsch). */
export type Subject = "physik" | "deutsch";

export interface SubjectDef {
  id: Subject;
  /** URL slug used by `/tests?subject=…`. */
  slug: string;
  label: string;
}

export const SUBJECTS: SubjectDef[] = [
  { id: "physik", slug: "physik", label: "Physik" },
  { id: "deutsch", slug: "deutsch", label: "Deutsch" },
];

export interface McArea {
  /** Subject this area belongs to. */
  subject: Subject;
  slug: string;
  label: string;
  topic: McTopic;
}

/**
 * Areas across all subjects. Physics areas group several sub-area tests; each
 * German grammar area currently carries a single test (its own topic).
 */
export const MC_AREAS: McArea[] = [
  { subject: "physik", slug: "optik", label: "Optik", topic: "Optik" },
  { subject: "physik", slug: "akustik", label: "Akustik", topic: "Akustik" },
  { subject: "physik", slug: "strom", label: "Elektrischer Stromkreis", topic: "Stromkreis" },
  { subject: "physik", slug: "magnetismus", label: "Magnetismus", topic: "Magnetismus" },
  { subject: "physik", slug: "groessen", label: "Größen & Messen", topic: "Größen" },
  { subject: "deutsch", slug: "wortarten", label: "Wortarten", topic: "Wortarten" },
  { subject: "deutsch", slug: "satzglieder", label: "Satzglieder", topic: "Satzglieder" },
  { subject: "deutsch", slug: "aktiv-passiv", label: "Aktiv / Passiv", topic: "Aktiv/Passiv" },
  { subject: "deutsch", slug: "tempus", label: "Tempus", topic: "Tempus" },
  { subject: "deutsch", slug: "attribute", label: "Attribute", topic: "Attribute" },
  { subject: "deutsch", slug: "feldermodell", label: "Feldermodell", topic: "Feldermodell" },
];

export function subjectBySlug(slug: string | null | undefined): SubjectDef | undefined {
  return SUBJECTS.find((subject) => subject.slug === slug);
}

export function areasForSubject(subject: Subject): McArea[] {
  return MC_AREAS.filter((area) => area.subject === subject);
}

export function areaBySlug(slug: string | null | undefined): McArea | undefined {
  return MC_AREAS.find((area) => area.slug === slug);
}
