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

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // func-style: prefer `function foo()` declarations over `const foo = () => {}`
  // for top-level exports outside React component files. Components keep using
  // arrow expressions and `function Component()` interchangeably (the existing
  // codebase mixes both); .tsx is therefore exempt. Scope is .ts only.
  {
    files: ["**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.contract.test.ts", "**/*.d.ts"],
    rules: {
      "func-style": ["warn", "declaration", { allowArrowFunctions: false }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".playwright-browsers/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
