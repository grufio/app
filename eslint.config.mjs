/**
 * ESLint configuration (Next.js + TypeScript).
 *
 * Responsibilities:
 * - Apply Next core-web-vitals + TS rules.
 * - Define ignores for build artifacts and reports.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-plugin-react-hooks v6 (shipped with eslint-config-next 16.2.5)
  // adds `react-hooks/set-state-in-effect` as an error. The 8 pre-existing
  // call-sites are now resolved: 5 dropped with dead code, 1 refactored to
  // derived state (trace-inline-svg's selectedFill suppression), 2 carry
  // targeted eslint-disable-next-line comments where the pattern is
  // legitimate fetch-on-mount that the rule doesn't model
  // (use-trace-handlers, use-svg-text). Rule restored to error.
  {
    rules: {
      // Treat `_`-prefixed args/vars as intentionally unused (matches the
      // common JS convention; helpful for vi.fn signatures where we keep
      // the parameter to satisfy a typed call shape but don't read it).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // JSDoc rule available for opt-in. Currently scoped to the smallest, most
  // user-facing surface (auth + monitoring + auth-redirect helpers) so the
  // baseline isn't drowned in 400+ warnings. Expand the file glob as the
  // codebase catches up; turn the rule from "warn" to "error" once the
  // scoped slice is clean.
  {
    files: [
      "services/auth/**/*.{ts,tsx}",
      "lib/auth/**/*.{ts,tsx}",
      "lib/monitoring/**/*.{ts,tsx}",
      "lib/storage/**/*.{ts,tsx}",
      "lib/api/**/*.{ts,tsx}",
      "lib/env.ts",
    ],
    ignores: ["**/*.test.{ts,tsx}", "**/*.contract.test.{ts,tsx}"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          contexts: [
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > VariableDeclaration",
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Self-contained sub-app: spanish-trainer/ ships its own eslint /
    // tsconfig / vitest config and is built as a separate Vercel project.
    // Keep gruf's repo-wide lint (with its stricter rule set) out of it.
    "spanish-trainer/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".playwright-browsers/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Gitignored experiment dir + vitest coverage output. Both carry
    // vendored JS (color-lab's Python venv ships colour/htmlcov;
    // coverage ships block-navigation.js) that lint shouldn't walk.
    "color-lab/**",
    "coverage/**",
    // Gitignored parallel-agent git worktrees (see CLAUDE.md). Each is a
    // full repo checkout incl. vendored JS and in-flight branch state;
    // lint must not walk into a sibling worktree's tree.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
