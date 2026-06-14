import type { VocabItem } from "./types";
import type { McItem } from "./mc";
import type { UserId } from "./user";
import { unidad5 } from "@/data/unidad5";
import { optik } from "@/data/physik/optik";
import { akustik } from "@/data/physik/akustik";
import { stromkreis } from "@/data/physik/stromkreis";
import { magnetismus } from "@/data/physik/magnetismus";
import { groessen } from "@/data/physik/groessen";

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
 * `users`, so each profile only sees its own subjects.
 */
export type TestDef =
  | (TestBase & { kind: "vocab"; items: VocabItem[] })
  | (TestBase & { kind: "mc"; items: McItem[] });

/** Registry of available tests. Add more here as they are created. */
export const TESTS: TestDef[] = [
  {
    kind: "vocab",
    id: "unidad5",
    title: "Unidad 5",
    subtitle: "Wortschatz & Konjugationen",
    users: ["admin", "q"],
    items: unidad5,
  },
  {
    kind: "mc",
    id: "phy-optik",
    title: "Optik",
    subtitle: "Licht & Sehen",
    users: ["r"],
    items: optik,
  },
  {
    kind: "mc",
    id: "phy-akustik",
    title: "Akustik",
    subtitle: "Schall & Hören",
    users: ["r"],
    items: akustik,
  },
  {
    kind: "mc",
    id: "phy-strom",
    title: "Elektrischer Stromkreis",
    subtitle: "Strom & Schaltungen",
    users: ["r"],
    items: stromkreis,
  },
  {
    kind: "mc",
    id: "phy-magnetismus",
    title: "Magnetismus",
    subtitle: "Magnete & Felder",
    users: ["r"],
    items: magnetismus,
  },
  {
    kind: "mc",
    id: "phy-groessen",
    title: "Größen & Messen",
    subtitle: "Einheiten & Arbeitsweise",
    users: ["r"],
    items: groessen,
  },
];

/** Resolve a test by id, falling back to the first test. */
export function testById(id: string | null | undefined): TestDef {
  return TESTS.find((test) => test.id === id) ?? TESTS[0];
}
