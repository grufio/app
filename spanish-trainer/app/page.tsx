"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { loadSrs, totalAnswered } from "@/lib/srs";
import { migrateLegacy, setActiveUser, USERS, type UserId } from "@/lib/user";

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [counts, setCounts] = useState<Record<UserId, number>>(
    () => Object.fromEntries(USERS.map((u) => [u.id, 0])) as Record<UserId, number>,
  );

  useEffect(() => {
    migrateLegacy();
    setCounts(
      Object.fromEntries(
        USERS.map((u) => [u.id, totalAnswered(loadSrs(u.id))]),
      ) as Record<UserId, number>,
    );
    setMounted(true);
  }, []);

  function choose(id: UserId) {
    setActiveUser(id);
    router.push("/tests");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-ink">Spanisch-Trainer</h1>
        <p className="mt-1 text-ink-soft">Wer übt?</p>
      </header>

      <div className="flex flex-col gap-3">
        {USERS.map((user) => (
          <button
            key={user.id}
            type="button"
            onClick={() => choose(user.id)}
            className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 text-left transition hover:border-brand active:scale-[0.99]"
          >
            <span className="text-lg font-medium text-ink">{user.label}</span>
            <span className="text-sm text-ink-soft">
              {mounted ? `${counts[user.id]} Fragen beantwortet` : "…"}
            </span>
          </button>
        ))}
      </div>
    </main>
  );
}
