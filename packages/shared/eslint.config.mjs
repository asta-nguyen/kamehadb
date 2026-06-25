// @ts-check

import { localPlugin } from "./eslint/no-restricted-syntax.mjs";

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
            "Remove console.log before committing. Use a proper logger instead.",
        },
      ],
    },
  },
  { ignores: ["dist/**"] },
];
