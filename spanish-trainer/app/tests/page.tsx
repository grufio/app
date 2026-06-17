"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  areaBySlug,
  areasForSubject,
  SUBJECTS,
  subjectBySlug,
  TESTS,
  type TestDef,
} from "@/lib/tests";
import { getActiveUser, USERS, type UserId } from "@/lib/user";

type McTest = Extract<TestDef, { kind: "mc" }>;

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
  const params = useSearchParams();
  const area = areaBySlug(params.get("area"));
  const subject = subjectBySlug(params.get("subject"));

  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<UserId>("admin");

  useEffect(() => {
    setUser(getActiveUser());
    setMounted(true);
  }, []);

  const label = USERS.find((u) => u.id === user)?.label ?? user;
  const visible = mounted ? TESTS.filter((test) => test.users.includes(user)) : [];
  const mcTests = visible.filter((test): test is McTest => test.kind === "mc");

  // Third level: the sub-areas of one (multi-test) area, with a back link.
  if (area) {
    const subTests = mcTests.filter((test) => test.area === area.topic);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{area.label}</h1>
            <p className="text-sm text-ink-soft">Unterbereich wählen</p>
          </div>
          <Link href={`/tests?subject=${area.subject}`} className="text-sm font-medium text-brand">
            ‹ Zurück
          </Link>
        </header>
        <div className="flex flex-col gap-3">
          {subTests.map((test) => (
            <Tile
              key={test.id}
              href={`/play?test=${test.id}`}
              title={test.title}
              subtitle={test.subtitle}
              right={`${test.items.length} Fragen`}
            />
          ))}
        </div>
      </main>
    );
  }

  // Second level: the areas of one subject. An area with a single test links
  // straight to that test; an area with several tests drills down further.
  if (subject) {
    const areas = areasForSubject(subject.id).filter((a) =>
      mcTests.some((test) => test.area === a.topic),
    );
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{subject.label}</h1>
            <p className="text-sm text-ink-soft">Bereich wählen</p>
          </div>
          <Link href="/tests" className="text-sm font-medium text-brand">
            ‹ Tests
          </Link>
        </header>
        <div className="flex flex-col gap-3">
          {areas.map((a) => {
            const tests = mcTests.filter((test) => test.area === a.topic);
            const total = tests.reduce((sum, test) => sum + test.items.length, 0);
            const single = tests.length === 1;
            return (
              <Tile
                key={a.slug}
                href={single ? `/play?test=${tests[0].id}` : `/tests?area=${a.slug}`}
                title={a.label}
                subtitle={single ? tests[0].subtitle : `${tests.length} Unterbereiche`}
                right={`${total} Fragen`}
              />
            );
          })}
        </div>
      </main>
    );
  }

  // Top level: vocab tests as direct tiles, mc subjects as drill-down tiles.
  const vocabTests = visible.filter((test) => test.kind === "vocab");
  const subjects = SUBJECTS.filter((s) =>
    areasForSubject(s.id).some((a) => mcTests.some((test) => test.area === a.topic)),
  );

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
            right={`${test.items.length} Wörter`}
          />
        ))}
        {subjects.map((s) => {
          const areas = areasForSubject(s.id).filter((a) =>
            mcTests.some((test) => test.area === a.topic),
          );
          const total = mcTests
            .filter((test) => areas.some((a) => a.topic === test.area))
            .reduce((sum, test) => sum + test.items.length, 0);
          return (
            <Tile
              key={s.slug}
              href={`/tests?subject=${s.slug}`}
              title={s.label}
              subtitle={`${areas.length} ${areas.length === 1 ? "Bereich" : "Bereiche"}`}
              right={`${total} Fragen`}
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
