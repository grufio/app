"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { loadSrs, type SrsMap } from "@/lib/srs";
import { areaBySlug, PHYSIK_AREAS, TESTS, type TestDef } from "@/lib/tests";
import { getActiveUser, USERS, type UserId } from "@/lib/user";

type McTest = Extract<TestDef, { kind: "mc" }>;

function practicedCount(items: ReadonlyArray<{ id: string }>, srs: SrsMap): number {
  return items.filter((item) => (srs[item.id]?.seen ?? 0) > 0).length;
}

function Tile({
  href,
  title,
  subtitle,
  right,
}: {
  href: string;
  title: string;
  subtitle: string;
  right: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 transition hover:border-brand active:scale-[0.99]"
    >
      <div>
        <p className="text-lg font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-soft">{subtitle}</p>
      </div>
      <span className="text-sm text-ink-soft">{right}</span>
    </Link>
  );
}

function TestsView() {
  const areaSlug = useSearchParams().get("area");
  const area = areaBySlug(areaSlug);

  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<UserId>("admin");
  const [srs, setSrs] = useState<SrsMap>({});

  useEffect(() => {
    const active = getActiveUser();
    setUser(active);
    setSrs(loadSrs(active));
    setMounted(true);
  }, []);

  const label = USERS.find((u) => u.id === user)?.label ?? user;
  const visible = TESTS.filter((test) => test.users.includes(user));

  // Second level: the sub-areas of one area, with a back link.
  if (area) {
    const subTests = visible.filter(
      (test): test is McTest => test.kind === "mc" && test.area === area.topic,
    );
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{area.label}</h1>
            <p className="text-sm text-ink-soft">Unterbereich wählen</p>
          </div>
          <Link href="/tests" className="text-sm font-medium text-brand">
            ‹ Tests
          </Link>
        </header>
        <div className="flex flex-col gap-3">
          {subTests.map((test) => (
            <Tile
              key={test.id}
              href={`/play?test=${test.id}`}
              title={test.title}
              subtitle={test.subtitle}
              right={mounted ? `${practicedCount(test.items, srs)}/${test.items.length} Fragen` : "…"}
            />
          ))}
        </div>
      </main>
    );
  }

  // Top level: vocab tests as direct tiles, physics areas as drill-down tiles.
  const vocabTests = visible.filter((test) => test.kind === "vocab");
  const mcTests = visible.filter((test): test is McTest => test.kind === "mc");
  const areas = PHYSIK_AREAS.filter((a) => mcTests.some((test) => test.area === a.topic));

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Tests</h1>
          <p className="text-sm text-ink-soft">
            Profil: <span className="text-ink">{mounted ? label : "…"}</span>
          </p>
        </div>
        <Link href="/" className="text-sm font-medium text-brand">
          Profil wechseln
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        {vocabTests.map((test) => (
          <Tile
            key={test.id}
            href={`/play?test=${test.id}`}
            title={test.title}
            subtitle={test.subtitle}
            right={mounted ? `${practicedCount(test.items, srs)}/${test.items.length} Wörter` : "…"}
          />
        ))}
        {areas.map((a) => {
          const tests = mcTests.filter((test) => test.area === a.topic);
          const items = tests.flatMap((test) => test.items);
          return (
            <Tile
              key={a.slug}
              href={`/tests?area=${a.slug}`}
              title={a.label}
              subtitle={`${tests.length} Unterbereiche`}
              right={mounted ? `${practicedCount(items, srs)}/${items.length} Fragen` : "…"}
            />
          );
        })}
      </div>
    </main>
  );
}

export default function TestsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center text-ink-soft">Lädt…</main>
      }
    >
      <TestsView />
    </Suspense>
  );
}
