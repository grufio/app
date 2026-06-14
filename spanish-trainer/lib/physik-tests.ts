import type { McItem } from "./mc";
import { optik } from "@/data/physik/optik";
import { akustik } from "@/data/physik/akustik";
import { stromkreis } from "@/data/physik/stromkreis";
import { magnetismus } from "@/data/physik/magnetismus";
import { groessen } from "@/data/physik/groessen";

export interface PhysikTest {
  id: string;
  title: string;
  subtitle: string;
  items: McItem[];
}

/** Registry of the physics sub-area tests. Add more areas here as needed. */
export const PHYSIK_TESTS: PhysikTest[] = [
  { id: "phy-optik", title: "Optik", subtitle: "Licht & Sehen", items: optik },
  { id: "phy-akustik", title: "Akustik", subtitle: "Schall & Hören", items: akustik },
  { id: "phy-strom", title: "Elektrischer Stromkreis", subtitle: "Strom & Schaltungen", items: stromkreis },
  { id: "phy-magnetismus", title: "Magnetismus", subtitle: "Magnete & Felder", items: magnetismus },
  { id: "phy-groessen", title: "Größen & Messen", subtitle: "Einheiten & Arbeitsweise", items: groessen },
];

/** Resolve a physics test by id, falling back to the first one. */
export function physikTestById(id: string | null | undefined): PhysikTest {
  return PHYSIK_TESTS.find((test) => test.id === id) ?? PHYSIK_TESTS[0];
}
