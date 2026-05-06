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
