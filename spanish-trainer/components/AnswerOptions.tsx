"use client";

import { motion } from "framer-motion";

export function AnswerOptions({
  options,
  answer,
  selected,
  answered,
  onSelect,
}: {
  options: string[];
  answer: string;
  selected: string | null;
  answered: boolean;
  onSelect: (option: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-3">
      {options.map((option) => {
        const isAnswer = option === answer;
        const isSelected = option === selected;

        let tone =
          "border-slate-600 bg-slate-800/70 hover:bg-slate-700 active:scale-[0.98]";
        if (answered && isAnswer) {
          tone = "border-emerald-400 bg-emerald-500/20 text-emerald-100";
        } else if (answered && isSelected && !isAnswer) {
          tone = "border-rose-400 bg-rose-500/20 text-rose-100";
        } else if (answered) {
          tone = "border-slate-700 bg-slate-800/40 opacity-60";
        }

        return (
          <motion.button
            key={option}
            type="button"
            disabled={answered}
            onClick={() => onSelect(option)}
            animate={
              answered && isSelected && !isAnswer
                ? { x: [0, -8, 8, -6, 6, 0] }
                : {}
            }
            transition={{ duration: 0.4 }}
            className={`min-h-14 rounded-2xl border px-5 py-4 text-left text-lg font-medium transition ${tone}`}
          >
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}
