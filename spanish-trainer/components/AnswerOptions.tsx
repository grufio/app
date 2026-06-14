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
    <div className="grid w-full grid-cols-1 gap-2">
      {options.map((option) => {
        const isAnswer = option === answer;
        const isSelected = option === selected;

        let tone =
          "border-line bg-surface text-ink hover:bg-canvas active:scale-[0.98]";
        if (answered && isAnswer) {
          tone = "border-ok bg-ok/10 text-ink";
        } else if (answered && isSelected && !isAnswer) {
          tone = "border-bad bg-bad/10 text-ink";
        } else if (answered) {
          tone = "border-line bg-surface text-ink-soft opacity-60";
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
            className={`min-h-12 rounded-2xl border px-4 py-3 text-left text-[17px] font-medium transition ${tone}`}
          >
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}
