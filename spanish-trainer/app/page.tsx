"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { TESTS } from "@/lib/tests";
import { migrateLegacy, setActiveUser, USERS, type UserId } from "@/lib/user";

/** Total number of questions/words available to a profile (static, no stats). */
function countLabel(id: UserId): string | null {
  const tests = TESTS.filter((t) => t.users.includes(id));
  if (tests.length === 0) return null;
  const total = tests.reduce((sum, t) => sum + t.items.length, 0);
  const unit = tests.some((t) => t.kind === "vocab") ? "Wörter" : "Fragen";
  return `${total} ${unit}`;
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    migrateLegacy();
  }, []);

  function choose(id: UserId) {
    if (id === "admin") {
      router.push("/admin");
      return;
    }
    setActiveUser(id);
    router.push("/tests");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-4 pt-16 pb-10">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-ink">Trainer</h1>
        <p className="mt-1 text-ink-soft">Wer übt?</p>
      </header>

      <div className="flex flex-col gap-3">
        {USERS.map((user) => {
          const count = countLabel(user.id);
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => choose(user.id)}
              className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 text-left transition hover:border-brand active:scale-[0.99]"
            >
              <span className="text-lg font-medium text-ink">{user.label}</span>
              {count && <span className="text-sm text-ink-soft">{count}</span>}
            </button>
          );
        })}
      </div>
    </main>
  );
}
