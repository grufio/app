"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import { loadSrs, MAX_BOX, type SrsMap } from "@/lib/srs";
import { areasForSubject, SUBJECTS, TESTS, testById, type TestDef } from "@/lib/tests";
import { USERS, type UserId } from "@/lib/user";
import {
  learnerLastActive,
  loadRuns,
  resetAllStats,
  resetGroup,
  runStats,
  testStats,
  type RunEntry,
} from "@/lib/stats";

// Client-side gate only — this is a simple barrier for a local single-user app,
// not real authentication.
const ADMIN_PASSWORD = "12345678";

const LEARNERS = USERS.filter((u) => u.id !== "admin");

function fmt(ts: number | null): string {
  if (ts === null) return "–";
  return new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function pct(value: number | null): string {
  return value === null ? "–" : `${Math.round(value * 100)} %`;
}

function userLabel(id: UserId): string {
  return USERS.find((u) => u.id === id)?.label ?? id;
}

function answeredOf(srs: SrsMap): number {
  return Object.values(srs).reduce((sum, e) => sum + e.seen, 0);
}
function overallAccuracy(srs: SrsMap): number | null {
  const entries = Object.values(srs);
  const seen = entries.reduce((s, e) => s + e.seen, 0);
  const correct = entries.reduce((s, e) => s + e.correct, 0);
  return seen > 0 ? correct / seen : null;
}
function masteredOf(srs: SrsMap): number {
  return Object.values(srs).filter((e) => e.box >= MAX_BOX).length;
}

function itemIdsOf(tests: TestDef[]): string[] {
  return tests.flatMap((t) => (t.items as { id: string }[]).map((i) => i.id));
}

/**
 * One resettable group in the admin view (an area, or a stand-alone vocab test).
 * Shows its test cards and a "Zurücksetzen" that clears only this group's SRS +
 * runs for this learner.
 */
function GroupBlock({
  label,
  tests,
  srs,
  runs,
  learnerId,
  groupKey,
  pending,
  setPending,
  onDidReset,
}: {
  label: string;
  tests: TestDef[];
  srs: SrsMap;
  runs: RunEntry[];
  learnerId: UserId;
  groupKey: string;
  pending: string | null;
  setPending: (key: string | null) => void;
  onDidReset: () => void;
}) {
  const confirming = pending === groupKey;

  function handleReset() {
    resetGroup(learnerId, itemIdsOf(tests), tests.map((t) => t.id));
    onDidReset();
    setPending(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink">{label}</h4>
        {confirming ? (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-full bg-bad px-3 py-1 text-xs font-medium text-white transition active:scale-95"
            >
              Ja, löschen
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink transition active:scale-95"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPending(groupKey)}
            className="shrink-0 text-xs font-medium text-ink-soft transition hover:text-bad active:scale-95"
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {tests.map((t) => {
        const ids = (t.items as { id: string }[]).map((i) => i.id);
        const ts = testStats(ids, srs);
        const rs = runStats(runs, learnerId, t.id);
        return (
          <div key={t.id} className="rounded-2xl border border-line bg-surface px-5 py-3 text-sm">
            <p className="font-medium text-ink">{t.title}</p>
            <p className="mt-0.5 text-ink-soft">
              geübt {ts.practiced}/{ts.total} · gemeistert {ts.mastered}/{ts.total} · Quote{" "}
              {pct(ts.accuracy)}
            </p>
            <p className="text-ink-soft">
              Läufe {rs.runs} · Best {rs.bestScore} · zuletzt {fmt(rs.lastAt)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [error, setError] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [srsByUser, setSrsByUser] = useState<Record<string, SrsMap>>({});
  // Which group's reset is awaiting confirmation ("<user>:<slug>" or "all").
  const [pending, setPending] = useState<string | null>(null);

  function refresh() {
    setRuns(loadRuns());
    setSrsByUser(Object.fromEntries(LEARNERS.map((u) => [u.id, loadSrs(u.id)])));
  }

  useEffect(() => {
    refresh();
    setMounted(true);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  }

  if (!unlocked) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
        <header className="text-center">
          <h1 className="text-2xl font-semibold text-ink">Admin</h1>
          <p className="mt-1 text-ink-soft">Passwort eingeben</p>
        </header>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Passwort"
            className="rounded-2xl border border-line bg-surface px-5 py-4 text-ink outline-none focus:border-brand"
          />
          {error && <p className="text-sm text-bad">Falsches Passwort.</p>}
          <button
            type="submit"
            className="rounded-full bg-brand px-4 py-3 text-[17px] font-medium text-white transition hover:bg-brand-hover active:scale-95"
          >
            Öffnen
          </button>
          <Link href="/" className="text-center text-sm font-medium text-brand">
            Zurück
          </Link>
        </form>
      </main>
    );
  }

  const sortedRuns = [...runs].sort((a, b) => b.at - a.at);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Admin · Statistik</h1>
        <Link href="/" className="text-sm font-medium text-brand">
          Startseite
        </Link>
      </header>

      {!mounted ? (
        <p className="text-ink-soft">Lädt…</p>
      ) : (
        <>
          {LEARNERS.map((learner) => {
            const srs = srsByUser[learner.id] ?? {};
            const learnerTests = TESTS.filter((t) => t.users.includes(learner.id));
            const mcTests = learnerTests.filter(
              (t): t is Extract<TestDef, { kind: "mc" }> => t.kind === "mc",
            );
            const vocabTests = learnerTests.filter((t) => t.kind === "vocab");
            const subjects = SUBJECTS.filter((s) =>
              areasForSubject(s.id).some((a) => mcTests.some((t) => t.area === a.topic)),
            );

            return (
              <section key={learner.id} className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold text-ink">{learner.label}</h2>
                <div className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-ink-soft">
                  <p>
                    Beantwortet: <span className="text-ink">{answeredOf(srs)}</span> · Trefferquote:{" "}
                    <span className="text-ink">{pct(overallAccuracy(srs))}</span> · Gemeistert:{" "}
                    <span className="text-ink">{masteredOf(srs)}</span>
                  </p>
                  <p className="mt-1">
                    Durchläufe:{" "}
                    <span className="text-ink">
                      {runs.filter((r) => r.user === learner.id).length}
                    </span>{" "}
                    · Zuletzt aktiv:{" "}
                    <span className="text-ink">{fmt(learnerLastActive(runs, learner.id))}</span>
                  </p>
                </div>

                {subjects.map((s) => {
                  const areas = areasForSubject(s.id).filter((a) =>
                    mcTests.some((t) => t.area === a.topic),
                  );
                  return (
                    <div key={s.id} className="flex flex-col gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                        {s.label}
                      </h3>
                      {areas.map((a) => (
                        <GroupBlock
                          key={a.slug}
                          label={a.label}
                          tests={mcTests.filter((t) => t.area === a.topic)}
                          srs={srs}
                          runs={runs}
                          learnerId={learner.id}
                          groupKey={`${learner.id}:${a.slug}`}
                          pending={pending}
                          setPending={setPending}
                          onDidReset={refresh}
                        />
                      ))}
                    </div>
                  );
                })}

                {vocabTests.map((t) => (
                  <GroupBlock
                    key={t.id}
                    label={t.title}
                    tests={[t]}
                    srs={srs}
                    runs={runs}
                    learnerId={learner.id}
                    groupKey={`${learner.id}:${t.id}`}
                    pending={pending}
                    setPending={setPending}
                    onDidReset={refresh}
                  />
                ))}
              </section>
            );
          })}

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-ink">Verlauf</h2>
            {sortedRuns.length === 0 ? (
              <p className="text-sm text-ink-soft">Noch keine Durchläufe.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedRuns.map((r, i) => (
                  <div
                    key={`${r.at}-${i}`}
                    className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink">
                        {userLabel(r.user)} · {testById(r.testId).title}
                      </p>
                      <p className="text-ink-soft">{fmt(r.at)}</p>
                    </div>
                    <span className="text-ink-soft">
                      {r.score} · {r.outcome === "won" ? "gewonnen" : "abgebrochen"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3 pb-4">
            {pending === "all" ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-soft">
                  Wirklich alle Statistiken (Verlauf + Zähler von Q und R) löschen?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetAllStats();
                      refresh();
                      setPending(null);
                    }}
                    className="flex-1 rounded-full bg-bad px-4 py-3 text-sm font-medium text-white transition active:scale-95"
                  >
                    Ja, alles zurücksetzen
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="flex-1 rounded-full border border-line bg-surface px-4 py-3 text-sm font-medium text-ink transition active:scale-95"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPending("all")}
                className="rounded-full border border-line bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-bad active:scale-95"
              >
                Alle Statistiken zurücksetzen
              </button>
            )}
          </section>
        </>
      )}
    </main>
  );
}
