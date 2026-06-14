"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { loadSrs, type SrsMap } from "@/lib/physik/store";
import { PHYSIK_TESTS } from "@/lib/physik-tests";

export default function PhysikTestsPage() {
  const [mounted, setMounted] = useState(false);
  const [srs, setSrs] = useState<SrsMap>({});

  useEffect(() => {
    setSrs(loadSrs());
    setMounted(true);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Physik Kompakt</h1>
          <p className="text-sm text-ink-soft">Wähle einen Bereich</p>
        </div>
        <Link href="/physik" className="text-sm font-medium text-brand">
          Zurück
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        {PHYSIK_TESTS.map((test) => {
          const practiced = test.items.filter(
            (item) => (srs[item.id]?.seen ?? 0) > 0,
          ).length;
          return (
            <Link
              key={test.id}
              href={`/physik/play?test=${test.id}`}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 transition hover:border-brand active:scale-[0.99]"
            >
              <div>
                <p className="text-lg font-medium text-ink">{test.title}</p>
                <p className="text-sm text-ink-soft">{test.subtitle}</p>
              </div>
              <span className="text-sm text-ink-soft">
                {mounted ? `${practiced}/${test.items.length} Fragen` : "…"}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
