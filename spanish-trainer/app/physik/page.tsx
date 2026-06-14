"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { loadSrs, totalAnswered } from "@/lib/physik/store";

export default function PhysikHome() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [answered, setAnswered] = useState(0);

  useEffect(() => {
    setAnswered(totalAnswered(loadSrs()));
    setMounted(true);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-ink">Physik Kompakt</h1>
        <p className="mt-1 text-ink-soft">Klasse 7 · Realschule</p>
      </header>

      <button
        type="button"
        onClick={() => router.push("/physik/tests")}
        className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4 text-left transition hover:border-brand active:scale-[0.99]"
      >
        <span className="text-lg font-medium text-ink">R</span>
        <span className="text-sm text-ink-soft">
          {mounted ? `${answered} Fragen beantwortet` : "…"}
        </span>
      </button>
    </main>
  );
}
