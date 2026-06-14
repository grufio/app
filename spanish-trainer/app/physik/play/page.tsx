"use client";

import { useState } from "react";

import { physikTestById } from "@/lib/physik-tests";
import { McPlay } from "@/components/McPlay";

export default function PhysikPlay() {
  // The deck is fixed at mount; the query param picks which area to run.
  const [test] = useState(() =>
    physikTestById(
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("test")
        : null,
    ),
  );

  return <McPlay test={test} />;
}
