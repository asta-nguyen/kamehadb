// @ts-check

import { parse, pattern, Lang } from "@ast-grep/napi";

/** @type {import("eslint").Rule.RuleModule} */
const noRestrictedSyntax = {
  meta: {
    type: "suggestion",
    schema: {
      type: "array",
      items: {
        oneOf: [
          { type: "string" },
          {
            type: "object",
            properties: {
              pattern: { type: "string" },
              message: { type: "string" },
            },
            required: ["pattern"],
            additionalProperties: false,
          },
        ],
      },
      uniqueItems: true,
      minItems: 0,
    },
    messages: {
      restrictedSyntax: "{{message}}",
    },
  },
  create(context) {
    /** @type {Array<{ pattern: string, message: string } | string>} */
    const patterns = context.options;
    const filename = context.filename ?? context.physicalFilename ?? "";
    const sgLang = filename.endsWith(".ts") ? Lang.TypeScript : Lang.JavaScript;

    return {
      Program() {
        const sourceCode = context.sourceCode.text;
        const root = parse(sgLang, sourceCode);

        patterns.forEach((entry) => {
          const patternStr =
            typeof entry === "string" ? entry : entry.pattern;
          const message =
            typeof entry === "string"
              ? "Restricted syntax found."
              : entry.message ?? "Restricted syntax found.";

          try {
            const patternNode = pattern(sgLang, patternStr);
            root
              .root()
              .findAll(patternNode)
              .forEach((match) => {
                const range = match.range();
                range.start.line += 1;
                range.end.line += 1;
                context.report({
                  loc: {
                    start: range.start,
                    end: range.end,
                  },
                  messageId: "restrictedSyntax",
                  data: { message },
                });
              });
          } catch (error) {
            context.report({
              loc: { line: 1, column: 0 },
              message: `Invalid pattern: ${patternStr}. Error: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        });
      },
    };
  },
};

/** @type {import("eslint").ESLint.Plugin} */
const localPlugin = {
  rules: { "no-restricted-syntax": noRestrictedSyntax },
};

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
