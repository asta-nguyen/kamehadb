type CompletionColumn = {
  name: string;
  type: string;
};

export type CompletionTable = {
  name: string;
  schema?: string;
  columns: CompletionColumn[];
};

export type CompletionsData = {
  tables: CompletionTable[];
};

export type CompletionContext =
  | "general"
  | "table"
  | "column"
  | "condition"
  | "function";

export type CompletionEntry = {
  label: string;
  insertText: string;
  detail?: string;
  kind: "keyword" | "operator" | "function" | "table" | "column";
  sortText?: string;
};

type AliasMap = Map<string, CompletionTable>;

const KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "GROUP BY",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
  "HAVING",
  "INSERT INTO",
  "UPDATE",
  "DELETE FROM",
  "AS",
  "DISTINCT",
];

const OPERATORS = [
  "AND",
  "OR",
  "IN",
  "NOT IN",
  "LIKE",
  "ILIKE",
  "BETWEEN",
  "EXISTS",
  "IS NULL",
  "IS NOT NULL",
  "=",
  "!=",
  ">",
  "<",
  ">=",
  "<=",
];

const FUNCTIONS = [
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
  "COALESCE",
  "LOWER",
  "UPPER",
  "ROUND",
  "NOW",
];

const TABLE_CONTEXT = /\b(?:FROM|JOIN|UPDATE|INTO)\s+[\w."]*$/i;
const CONDITION_CONTEXT = /\b(?:WHERE|AND|OR|ON|HAVING)\s+[\w."]*$/i;
const SELECT_CONTEXT = /\bSELECT\s+[\w.,\s"]*$/i;
const GROUP_ORDER_CONTEXT = /\b(?:GROUP\s+BY|ORDER\s+BY)\s+[\w.,\s"]*$/i;
const FUNCTION_CONTEXT = /\b[\w"]+\($/i;

function normalizeIdentifier(value: string): string {
  return value.replace(/^"+|"+$/g, "").toLowerCase();
}

function tableNames(table: CompletionTable): string[] {
  const names = [table.name];
  if (table.schema) names.push(`${table.schema}.${table.name}`);
  return names;
}

function buildAliasMap(sql: string, tables: CompletionTable[]): AliasMap {
  const aliases = new Map<string, CompletionTable>();
  const tableByName = new Map<string, CompletionTable>();

  for (const table of tables) {
    for (const name of tableNames(table)) {
      tableByName.set(normalizeIdentifier(name), table);
    }
  }

  const regex =
    /\b(?:FROM|JOIN|UPDATE|INTO)\s+((?:"?[\w$]+"?\.)?"?[\w$]+"?)(?:\s+(?:AS\s+)?("?[\w$]+"?))?/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sql)) !== null) {
    const tableName = normalizeIdentifier(match[1]);
    const table = tableByName.get(tableName);
    const alias = match[2] ? normalizeIdentifier(match[2]) : null;
    if (table && alias) aliases.set(alias, table);
  }

  return aliases;
}

function detectContext(textUntil: string): CompletionContext {
  if (TABLE_CONTEXT.test(textUntil)) return "table";
  if (CONDITION_CONTEXT.test(textUntil)) return "condition";
  if (SELECT_CONTEXT.test(textUntil) || GROUP_ORDER_CONTEXT.test(textUntil)) return "column";
  if (FUNCTION_CONTEXT.test(textUntil)) return "column";
  return "general";
}

function buildKeywordSuggestions(): CompletionEntry[] {
  return KEYWORDS.map((label, index) => ({
    label,
    insertText: label,
    detail: "keyword",
    kind: "keyword",
    sortText: `1-${index.toString().padStart(3, "0")}`,
  }));
}

function buildOperatorSuggestions(): CompletionEntry[] {
  return OPERATORS.map((label, index) => ({
    label,
    insertText: label,
    detail: "operator",
    kind: "operator",
    sortText: `2-${index.toString().padStart(3, "0")}`,
  }));
}

function buildFunctionSuggestions(): CompletionEntry[] {
  return FUNCTIONS.map((label, index) => ({
    label,
    insertText: `${label}()`,
    detail: "function",
    kind: "function",
    sortText: `3-${index.toString().padStart(3, "0")}`,
  }));
}

function buildTableSuggestions(tables: CompletionTable[]): CompletionEntry[] {
  const seen = new Set<string>();
  const suggestions: CompletionEntry[] = [];

  for (const table of tables) {
    const qualifiedName = table.schema ? `${table.schema}.${table.name}` : table.name;
    const label = qualifiedName;
    const dedupeKey = normalizeIdentifier(label);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    suggestions.push({
      label,
      insertText: label,
      detail: table.schema ? `table (${table.schema})` : "table",
      kind: "table",
      sortText: `4-${label.toLowerCase()}`,
    });
  }

  return suggestions;
}

function buildColumnSuggestions(
  tables: CompletionTable[],
  aliases: AliasMap,
  qualified = true,
): CompletionEntry[] {
  const suggestions: CompletionEntry[] = [];
  const seen = new Set<string>();

  const aliasEntries = Array.from(aliases.entries()).map(([alias, table]) => ({
    qualifier: alias,
    table,
  }));

  const tableEntries = tables.map((table) => ({
    qualifier: table.name,
    table,
  }));

  const entries = aliasEntries.length > 0 ? [...aliasEntries, ...tableEntries] : tableEntries;

  for (const entry of entries) {
    for (const column of entry.table.columns) {
      const label = qualified ? `${entry.qualifier}.${column.name}` : column.name;
      const dedupeKey = `${normalizeIdentifier(entry.qualifier)}:${normalizeIdentifier(column.name)}:${qualified}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      suggestions.push({
        label,
        insertText: label,
        detail: `${column.type} • ${entry.table.schema ? `${entry.table.schema}.` : ""}${entry.table.name}`,
        kind: "column",
        sortText: `5-${label.toLowerCase()}`,
      });
    }
  }

  return suggestions;
}

export function buildSqlCompletionEntries(
  sql: string,
  textUntil: string,
  data: CompletionsData,
): CompletionEntry[] {
  const aliases = buildAliasMap(sql, data.tables);
  const dotMatch = textUntil.match(/([\w".]+)\.$/);

  if (dotMatch) {
    const qualifier = normalizeIdentifier(dotMatch[1]);
    const aliasedTable = aliases.get(qualifier);
    const matchedTable = data.tables.find((table) =>
      tableNames(table).some((name) => normalizeIdentifier(name) === qualifier),
    );
    const targetTable = aliasedTable ?? matchedTable;

    if (!targetTable) return [];

    return targetTable.columns.map((column, index) => ({
      label: column.name,
      insertText: column.name,
      detail: `${column.type} • ${targetTable.schema ? `${targetTable.schema}.` : ""}${targetTable.name}`,
      kind: "column",
      sortText: `0-${index.toString().padStart(3, "0")}`,
    }));
  }

  const context = detectContext(textUntil);
  const entries: CompletionEntry[] = [];

  if (context === "table") {
    entries.push(...buildTableSuggestions(data.tables));
    entries.push(...buildKeywordSuggestions().filter((item) => item.label.includes("JOIN")));
    return entries;
  }

  if (context === "condition") {
    entries.push(...buildColumnSuggestions(data.tables, aliases, true));
    entries.push(...buildOperatorSuggestions());
    entries.push(...buildFunctionSuggestions());
    return entries;
  }

  if (context === "column" || context === "function") {
    entries.push(...buildColumnSuggestions(data.tables, aliases, true));
    entries.push(...buildFunctionSuggestions());
    entries.push(...buildKeywordSuggestions());
    return entries;
  }

  entries.push(...buildKeywordSuggestions());
  entries.push(...buildFunctionSuggestions());
  entries.push(...buildTableSuggestions(data.tables));
  entries.push(...buildColumnSuggestions(data.tables, aliases, true));
  return entries;
}
