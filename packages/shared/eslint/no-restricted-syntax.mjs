// @ts-check

import { parse, pattern, Lang } from "@ast-grep/napi";

/**
 * Shared ast-grep rule that bans configurable syntax patterns.
 *
 * We use a local rule instead of eslint-plugin-ast-grep because the upstream
 * plugin uses Lang.TypeScript for ALL TS/TSX files — it can't parse JSX.
 * Our rule checks context.filename and picks the correct language.
 *
 * @type {import("eslint").Rule.RuleModule}
 */
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
    const sgLang = filename.endsWith(".tsx")
      ? Lang.Tsx
      : filename.endsWith(".ts")
        ? Lang.TypeScript
        : Lang.JavaScript;

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
export const localPlugin = {
  rules: { "no-restricted-syntax": noRestrictedSyntax },
};
