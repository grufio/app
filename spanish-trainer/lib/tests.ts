import type { VocabItem } from "./types";
import { unidad5 } from "@/data/unidad5";

export interface TestDef {
  id: string;
  title: string;
  subtitle: string;
  items: VocabItem[];
}

/** Registry of available tests. Add more units here as they are created. */
export const TESTS: TestDef[] = [
  {
    id: "unidad5",
    title: "Unidad 5",
    subtitle: "Wortschatz & Konjugationen",
    items: unidad5,
  },
];

/** Resolve a test by id, falling back to the first test. */
export function testById(id: string | null | undefined): TestDef {
  return TESTS.find((test) => test.id === id) ?? TESTS[0];
}
