"use client";

import { useState } from "react";

import { testById } from "@/lib/tests";
import { VocabPlay } from "@/components/VocabPlay";
import { McPlay } from "@/components/McPlay";

export default function Play() {
  // The deck is fixed at mount; the query param picks which test to run.
  const [test] = useState(() =>
    testById(
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("test")
        : null,
    ),
  );

  // Split by kind: the vocab and multiple-choice engines use different hooks,
  // so they must live in separate components (hooks can't be called
  // conditionally within one component).
  return test.kind === "mc" ? (
    <McPlay test={test} />
  ) : (
    <VocabPlay test={test} />
  );
}
