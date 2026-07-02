"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { testById } from "@/lib/tests";
import { VocabPlay } from "@/components/VocabPlay";
import { McPlay } from "@/components/McPlay";

function PlayView() {
  // Read the test from the URL reactively via useSearchParams — NOT from
  // window.location in a useState initializer. The latter runs undefined on the
  // server (→ testById(null) → the first test, Unidad 5) and isn't reactive to
  // App-Router navigation, so the wrong (Spanish) test stuck until a hard reload.
  const params = useSearchParams();
  const test = testById(params.get("test"));

  // Split by kind: the vocab and multiple-choice engines use different hooks,
  // so they live in separate components. Keying on the test id gives each test
  // a fresh deck when the selection changes.
  return test.kind === "mc" ? (
    <McPlay key={test.id} test={test} />
  ) : (
    <VocabPlay key={test.id} test={test} />
  );
}

export default function Play() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center text-ink-soft">
          Lädt…
        </main>
      }
    >
      <PlayView />
    </Suspense>
  );
}
