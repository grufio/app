"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { correctDisplay, matchAnswer, type MatchResult } from "@/lib/answer-match";
import type { Direction } from "@/lib/types";

// Quick-insert characters for the language being typed.
const CHARS: Record<Direction, string[]> = {
  "de-es": ["á", "é", "í", "ó", "ú", "ñ", "¿", "¡"], // typing Spanish
  "es-de": ["ä", "ö", "ü", "ß"], // typing German
};

export function TypeInput({
  answer,
  direction,
  onResult,
}: {
  answer: string;
  direction: Direction;
  onResult: (result: MatchResult) => void;
}) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const display = correctDisplay(answer);
  const done = result !== null;

  function submit(forced?: MatchResult) {
    if (done) return;
    const r = forced ?? matchAnswer(value, answer);
    setResult(r);
    onResult(r);
  }

  function insert(ch: string) {
    const el = inputRef.current;
    if (!el) {
      setValue((v) => v + ch);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + ch + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + ch.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const fieldTone =
    result === "correct"
      ? "border-ok"
      : result === "almost"
        ? "border-[#ff9500]"
        : result === "wrong"
          ? "border-bad"
          : "border-line focus:border-brand";

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="w-full">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={done}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          lang={direction === "es-de" ? "de" : "es"}
          placeholder="Antwort eintippen…"
          className={`w-full rounded-2xl border bg-surface px-4 py-3 text-center text-xl text-ink outline-none transition ${fieldTone}`}
        />
      </form>

      {!done ? (
        <>
          <div className="flex flex-wrap justify-center gap-1.5">
            {CHARS[direction].map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => insert(ch)}
                className="h-9 min-w-9 rounded-lg border border-line bg-canvas px-2 text-ink transition hover:bg-black/[0.03] active:scale-95"
              >
                {ch}
              </button>
            ))}
          </div>
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => submit("wrong")}
              className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink-soft transition hover:bg-canvas active:scale-95"
            >
              Weiß ich nicht
            </button>
            <button
              type="button"
              onClick={() => submit()}
              className="flex-[2] rounded-full bg-brand px-4 py-2.5 text-[17px] font-medium text-white transition hover:bg-brand-hover active:scale-95"
            >
              Prüfen
            </button>
          </div>
        </>
      ) : result === "correct" ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm font-semibold text-ok"
        >
          Richtig!
        </motion.p>
      ) : (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`text-center text-sm font-medium ${result === "almost" ? "text-[#ff9500]" : "text-bad"}`}
        >
          {result === "almost" ? "Fast! Richtig: " : "Richtig: "}
          <span className="font-semibold text-ink">{display}</span>
        </motion.p>
      )}
    </div>
  );
}
