// @ts-check

import { localPlugin } from "@kamehadb/shared/eslint/no-restricted-syntax.mjs";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    files: ["src/**/*.ts"],
    plugins: {
      local: localPlugin,
    },
    languageOptions: {
      parser: (await import("@typescript-eslint/parser")).default,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "local/no-restricted-syntax": [
        "error",
        {
          pattern: "$EXPR as any",
          message:
            'Do not use `as any`. Use `unknown` with proper type narrowing instead.',
        },
        {
          pattern: "console.log($$$)",
          message:
            "Remove console.log before committing. Use the sidecar logger (pino) instead.",
        },
        {
          pattern: "console.warn($$$)",
          message:
            "Remove console.warn before committing. Use the sidecar logger (pino) instead.",
        },
        {
          pattern: "console.error($$$)",
          message:
            "Remove console.error before committing. Use the sidecar logger (pino) instead.",
        },
      ],
    },
  },
  { ignores: ["dist/**", "*.config.*", "scripts/**"] },
];
