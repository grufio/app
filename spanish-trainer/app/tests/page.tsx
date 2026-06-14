"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { loadSrs, type SrsMap } from "@/lib/srs";
import { TESTS } from "@/lib/tests";
import { getActiveUser, USERS, type UserId } from "@/lib/user";

export default function TestsPage() {
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
        {TESTS.map((test) => {
          const practiced = test.items.filter(
            (item) => (srs[item.id]?.seen ?? 0) > 0,
          ).length;
          return (
            <Link
              key={test.id}
              href={`/play?test=${test.id}`}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 transition hover:border-brand active:scale-[0.99]"
            >
              <div>
                <p className="text-lg font-medium text-ink">{test.title}</p>
                <p className="text-sm text-ink-soft">{test.subtitle}</p>
              </div>
              <span className="text-sm text-ink-soft">
                {mounted ? `${practiced}/${test.items.length} Wörter` : "…"}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
