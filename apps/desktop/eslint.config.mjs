// @ts-check

import { localPlugin } from "@kamehadb/shared/eslint/no-restricted-syntax.mjs";

// Config

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      local: localPlugin,
    },
    languageOptions: {
      parser: (await import("@typescript-eslint/parser")).default,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "local/no-restricted-syntax": [
        "error",
        // Type safety: never use `as any` — prefer `unknown` + narrowing
        {
          pattern: "$EXPR as any",
          message:
            'Do not use `as any`. Use `unknown` with proper type narrowing instead.',
        },
        // Debugging: no console.log in committed code
        {
          pattern: "console.log($$$)",
          message:
            "Remove console.log before committing. Use a proper logger or debug utility.",
        },
        // --- shadcn component enforcement ---
        // Each raw HTML element that has a shadcn equivalent is banned.
        // <button> → shadcn <Button>
        {
          pattern: "<button $$$>$$$</button>",
          message: 'Use shadcn <Button> component instead of raw <button>.',
        },
        // <input> → shadcn <Input>
        {
          pattern: "<input $$$/>",
          message: 'Use shadcn <Input> component instead of raw <input>.',
        },
        // <textarea> → shadcn <Textarea>
        {
          pattern: "<textarea $$$>$$$</textarea>",
          message:
            'Use shadcn <Textarea> component instead of raw <textarea>.',
        },
        // <label> → shadcn <Label>
        {
          pattern: "<label $$$>$$$</label>",
          message: 'Use shadcn <Label> component instead of raw <label>.',
        },
        // <table> → shadcn <Table> + parts
        {
          pattern: "<table $$$>$$$</table>",
          message:
            'Use shadcn <Table> component instead of raw <table>.',
        },
        // <select> → shadcn <Select> + parts
        {
          pattern: "<select $$$>$$$</select>",
          message:
            'Use shadcn <Select> component instead of raw <select>.',
        },
        // <thead> → shadcn <TableHeader>
        {
          pattern: "<thead $$$>$$$</thead>",
          message:
            'Use shadcn <TableHeader> component instead of raw <thead>.',
        },
        // <tbody> → shadcn <TableBody>
        {
          pattern: "<tbody $$$>$$$</tbody>",
          message:
            'Use shadcn <TableBody> component instead of raw <tbody>.',
        },
        // <tr> → shadcn <TableRow>
        {
          pattern: "<tr $$$>$$$</tr>",
          message:
            'Use shadcn <TableRow> component instead of raw <tr>.',
        },
        // <th> → shadcn <TableHead>
        {
          pattern: "<th $$$>$$$</th>",
          message:
            'Use shadcn <TableHead> component instead of raw <th>.',
        },
        // <td> → shadcn <TableCell>
        {
          pattern: "<td $$$>$$$</td>",
          message:
            'Use shadcn <TableCell> component instead of raw <td>.',
        },
      ],
    },
  },
  // Ignore patterns — ESLint 9 default ignores node_modules/ already
  { ignores: ["src-tauri/**", "dist/**", "*.config.*"] },
];
