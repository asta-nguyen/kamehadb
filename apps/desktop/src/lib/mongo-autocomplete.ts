export type MongoCompletionCollection = {
  name: string;
  fields: string[];
};

export type MongoCompletionsData = {
  collections: MongoCompletionCollection[];
};

export type MongoCompletionEntry = {
  label: string;
  insertText: string;
  detail?: string;
  kind: 'stage' | 'operator' | 'accumulator' | 'expression' | 'collection' | 'field' | 'keyword';
  sortText?: string;
};

// Aggregation pipeline stages
const STAGES = [
  { label: '$match', detail: 'Filter documents', insertText: '$match: { $$0 }', placeholders: 1 },
  { label: '$group', detail: 'Group documents', insertText: '$group: { _id: $$0 }', placeholders: 1 },
  { label: '$sort', detail: 'Sort documents', insertText: '$sort: { $$0: 1 }', placeholders: 1 },
  { label: '$project', detail: 'Shape documents', insertText: '$project: { $$0: 1 }', placeholders: 1 },
  {
    label: '$lookup',
    detail: 'Join collections',
    insertText: '$lookup: { from: "$$0", localField: "", foreignField: "", as: "" }',
    placeholders: 1,
  },
  { label: '$unwind', detail: 'Deconstruct array field', insertText: '$unwind: "$$0"', placeholders: 1 },
  { label: '$addFields', detail: 'Add computed fields', insertText: '$addFields: { $$0:  }', placeholders: 1 },
  { label: '$set', detail: 'Alias for $addFields', insertText: '$set: { $$0:  }', placeholders: 1 },
  { label: '$unset', detail: 'Remove fields', insertText: '$unset: "$$0"', placeholders: 1 },
  { label: '$count', detail: 'Count documents', insertText: '$count: "$$0"', placeholders: 1 },
  { label: '$limit', detail: 'Limit documents', insertText: '$limit: $$$$0', placeholders: 1 },
  { label: '$skip', detail: 'Skip documents', insertText: '$skip: $$$$0', placeholders: 1 },
  { label: '$sample', detail: 'Random sample', insertText: '$sample: { size: $$$$0 }', placeholders: 1 },
  { label: '$sortByCount', detail: 'Sort by count', insertText: '$sortByCount: "$$0"', placeholders: 1 },
  {
    label: '$bucket',
    detail: 'Bucket documents',
    insertText: '$bucket: { groupBy: $$0, boundaries: [], default: "", output: {} }',
    placeholders: 1,
  },
  { label: '$facet', detail: 'Multi-faceted search', insertText: '$facet: { $$0: [] }', placeholders: 1 },
  {
    label: '$replaceRoot',
    detail: 'Replace root document',
    insertText: '$replaceRoot: { newRoot: $$0 }',
    placeholders: 1,
  },
  { label: '$merge', detail: 'Write results to collection', insertText: '$merge: { into: "$$0" }', placeholders: 1 },
  { label: '$out', detail: 'Output to collection', insertText: '$out: "$$0"', placeholders: 1 },
  {
    label: '$search',
    detail: 'Full-text search (Atlas)',
    insertText: '$search: { index: "$$0", text: { query: "", path: "" } }',
    placeholders: 1,
  },
];

// Query/expression operators that appear inside $match etc.
// Note: $box, $polygon, $center, $centerSphere, $geometry are intentionally
// excluded — they are sub-operators of $geoWithin/$geoIntersects, not
// standalone top-level query operators.
const QUERY_OPERATORS = [
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$in',
  '$nin',
  '$and',
  '$or',
  '$not',
  '$nor',
  '$exists',
  '$type',
  '$regex',
  '$options',
  '$all',
  '$elemMatch',
  '$expr',
  '$size',
  '$mod',
  '$where',
  '$geoWithin',
  '$geoIntersects',
  '$near',
  '$nearSphere',
  '$text',
  '$language',
  '$caseSensitive',
  '$diacriticSensitive',
];

// Update operators for update operations ($set, $unset, $inc, etc.)
const UPDATE_OPERATORS = [
  { label: '$set', detail: 'Set field value' },
  { label: '$unset', detail: 'Remove field' },
  { label: '$inc', detail: 'Increment field' },
  { label: '$mul', detail: 'Multiply field' },
  { label: '$rename', detail: 'Rename field' },
  { label: '$min', detail: 'Set if lower' },
  { label: '$max', detail: 'Set if higher' },
  { label: '$currentDate', detail: 'Set to current date' },
  { label: '$push', detail: 'Append to array' },
  { label: '$pull', detail: 'Remove from array' },
  { label: '$pop', detail: 'Remove last/first element' },
  { label: '$addToSet', detail: 'Add unique to array' },
  { label: '$pullAll', detail: 'Remove all matching values' },
  { label: '$each', detail: 'Multiple values for $push/$addToSet' },
  { label: '$position', detail: 'Position for $push' },
  { label: '$slice', detail: 'Limit array size after $push' },
  { label: '$sort', detail: 'Sort array after $push' },
];

// Accumulators used inside $group
const ACCUMULATORS = [
  { label: '$sum', detail: 'Sum values' },
  { label: '$avg', detail: 'Average values' },
  { label: '$min', detail: 'Minimum value' },
  { label: '$max', detail: 'Maximum value' },
  { label: '$first', detail: 'First value in group' },
  { label: '$last', detail: 'Last value in group' },
  { label: '$push', detail: 'Collect values into array' },
  { label: '$addToSet', detail: 'Collect unique values into array' },
  { label: '$stdDevPop', detail: 'Population standard deviation' },
  { label: '$stdDevSamp', detail: 'Sample standard deviation' },
];

// Expression operators used in $project, $addFields, etc.
const EXPRESSION_OPERATORS = [
  { label: '$cond', detail: 'Ternary conditional', insertText: '$cond: { if: $$0, then: "", else: "" }' },
  { label: '$ifNull', detail: 'Fallback if null', insertText: '$ifNull: ["$$0", ""]' },
  {
    label: '$switch',
    detail: 'Switch-case conditional',
    insertText: '$switch: { branches: [{ case: $$0, then: "" }], default: "" }',
  },
  { label: '$toString', detail: 'Convert to string' },
  { label: '$toInt', detail: 'Convert to integer' },
  { label: '$toDouble', detail: 'Convert to double' },
  { label: '$toLong', detail: 'Convert to long' },
  { label: '$toDate', detail: 'Convert to date' },
  { label: '$toBool', detail: 'Convert to boolean' },
  {
    label: '$convert',
    detail: 'Type conversion',
    insertText: '$convert: { input: $$0, to: "", onError: "", onNull: "" }',
  },
  { label: '$substr', detail: 'Substring', insertText: '$substr: ["$$0", 0, 1]' },
  { label: '$concat', detail: 'Concatenate strings', insertText: '$concat: ["$$0", ""]' },
  { label: '$toUpper', detail: 'Uppercase string' },
  { label: '$toLower', detail: 'Lowercase string' },
  { label: '$trim', detail: 'Trim whitespace' },
  { label: '$split', detail: 'Split string', insertText: '$split: ["$$0", ""]' },
  { label: '$dateToString', detail: 'Format date', insertText: '$dateToString: { format: "%Y-%m-%d", date: $$0 }' },
  { label: '$year', detail: 'Extract year' },
  { label: '$month', detail: 'Extract month' },
  { label: '$dayOfMonth', detail: 'Extract day of month' },
  { label: '$hour', detail: 'Extract hour' },
  { label: '$minute', detail: 'Extract minute' },
  { label: '$second', detail: 'Extract second' },
  { label: '$filter', detail: 'Filter array', insertText: '$filter: { input: $$0, as: "item", cond: {} }' },
  { label: '$map', detail: 'Transform array', insertText: '$map: { input: $$0, as: "item", in: {} }' },
  { label: '$reduce', detail: 'Reduce array', insertText: '$reduce: { input: $$0, initialValue: null, in: {} }' },
  { label: '$size', detail: 'Array size' },
  { label: '$arrayElemAt', detail: 'Element at index', insertText: '$arrayElemAt: ["$$0", 0]' },
  { label: '$first', detail: 'First element' },
  { label: '$last', detail: 'Last element' },
  { label: '$round', detail: 'Round number' },
  { label: '$ceil', detail: 'Ceiling' },
  { label: '$floor', detail: 'Floor' },
  { label: '$sqrt', detail: 'Square root' },
  { label: '$pow', detail: 'Power', insertText: '$pow: ["$$0", 2]' },
  { label: '$abs', detail: 'Absolute value' },
  { label: '$mod', detail: 'Modulo' },
  { label: '$multiply', detail: 'Multiply' },
  { label: '$add', detail: 'Add' },
  { label: '$subtract', detail: 'Subtract' },
  { label: '$divide', detail: 'Divide' },
  { label: '$cmp', detail: 'Compare two values' },
];

function buildStagesSuggestions(): MongoCompletionEntry[] {
  return STAGES.map((s, i) => ({
    label: s.label,
    insertText: s.label,
    detail: s.detail,
    kind: 'stage',
    sortText: `1-${i.toString().padStart(3, '0')}`,
  }));
}

function buildOperatorSuggestions(): MongoCompletionEntry[] {
  return QUERY_OPERATORS.map((op, i) => ({
    label: op,
    insertText: op,
    detail: 'query operator',
    kind: 'operator',
    sortText: `2-${i.toString().padStart(3, '0')}`,
  }));
}

function buildUpdateOperatorSuggestions(): MongoCompletionEntry[] {
  return UPDATE_OPERATORS.map((op, i) => ({
    label: op.label,
    insertText: op.label,
    detail: op.detail,
    kind: 'operator',
    sortText: `2b-${i.toString().padStart(3, '0')}`,
  }));
}

function buildAccumulatorSuggestions(): MongoCompletionEntry[] {
  return ACCUMULATORS.map((a, i) => ({
    label: a.label,
    insertText: a.label,
    detail: a.detail,
    kind: 'accumulator',
    sortText: `3-${i.toString().padStart(3, '0')}`,
  }));
}

function buildExpressionSuggestions(): MongoCompletionEntry[] {
  return EXPRESSION_OPERATORS.map((e, i) => ({
    label: e.label,
    insertText: e.insertText ?? e.label,
    detail: e.detail,
    kind: 'expression',
    sortText: `4-${i.toString().padStart(3, '0')}`,
  }));
}

function buildCollectionsSuggestions(collections: MongoCompletionCollection[]): MongoCompletionEntry[] {
  return collections.map((c) => ({
    label: c.name,
    insertText: c.name,
    detail: 'collection',
    kind: 'collection',
    sortText: `5-${c.name}`,
  }));
}

function buildFieldsSuggestions(collections: MongoCompletionCollection[]): MongoCompletionEntry[] {
  const seen = new Set<string>();
  const result: MongoCompletionEntry[] = [];
  for (const coll of collections) {
    for (const field of coll.fields) {
      if (seen.has(field)) continue;
      seen.add(field);
      result.push({
        label: `"${field}"`,
        insertText: `"${field}"`,
        detail: 'field',
        kind: 'field',
        sortText: `6-${field}`,
      });
    }
  }
  return result;
}

// Detect what context the cursor is in based on the text before it
type MongoCompletionContext =
  | 'pipeline'
  | 'stage'
  | 'match'
  | 'group'
  | 'project'
  | 'addfields'
  | 'expression'
  | 'string'
  | 'general';

// Heuristic parser to infer the MongoDB autocomplete context from partial input.
// Needed to decide which suggestions to show: pipeline stages, stage-specific
// operators, or general expression operators. Counts unmatched brackets/braces
// (openBrackets/openBraces/closeBrackets/closeBraces) to determine depth, then
// inspects the last line with a regex (stageMatch) to detect stage keys like
// $match, $group, $project, etc. Returns one of the context types:
// 'pipeline','stage','match','group','project','addfields','expression',
// 'general'. Limitations: does not handle braces inside strings, comments, or
// nested complex syntax reliably.
function detectContext(textUntil: string): MongoCompletionContext {
  // Count unmatched braces: { and [
  // This gives us depth and context
  const lines = textUntil.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';

  // Check if we just typed $ (suggest operators)
  if (lastLine.match(/\$\s*$/)) {
    return 'expression';
  }

  // Check if we're at top level array (pipeline array)
  // Pipeline stages are at depth 1 (inside outer array)
  const openBrackets = (textUntil.match(/\[/g) || []).length;
  const closeBrackets = (textUntil.match(/\]/g) || []).length;
  const openBraces = (textUntil.match(/\{/g) || []).length;
  const closeBraces = (textUntil.match(/\}/g) || []).length;

  const arrayDepth = openBrackets - closeBrackets;
  const braceDepth = openBraces - closeBraces;

  // At top level of pipeline array, suggest stages
  if (arrayDepth >= 1 && braceDepth === 0) {
    return 'pipeline';
  }

  // Check for known stage context in the last open object
  // Simple heuristic: check if last line starts with a stage key
  const stageMatch = lastLine.match(/^\s*"?\$(\w+)"?\s*:/);
  if (stageMatch) {
    const stageName = stageMatch[1];
    switch (stageName) {
      case 'match':
        return 'match';
      case 'group':
        return 'group';
      case 'project':
        return 'project';
      case 'addFields':
      case 'set':
        return 'addfields';
      default:
        return 'stage';
    }
  }

  // If we're inside an object after a stage name, suggest stage-appropriate operators
  if (braceDepth >= 1 && arrayDepth >= 1) {
    return 'general';
  }

  return 'general';
}

/**
 * Generate autocomplete suggestions for Mongo queries based on cursor position.
 * Uses {@link detectContext} to infer the current context (pipeline stage,
 * match operator, group accumulator, etc.), then aggregates matching entries
 * from the relevant suggestion builders (buildStagesSuggestions,
 * buildOperatorSuggestions, buildAccumulatorSuggestions,
 * buildExpressionSuggestions, buildFieldsSuggestions, buildCollectionsSuggestions).
 * When `data` is null, field and collection suggestions are omitted.
 * @param textUntil - The text preceding the cursor in the editor.
 * @param data - Schema metadata (collections, fields) or null for bare suggestions.
 * @returns Filtered {@link MongoCompletionEntry[]} for the current context.
 */
export function buildMongoCompletionEntries(
  textUntil: string,
  data: MongoCompletionsData | null,
): MongoCompletionEntry[] {
  const context = detectContext(textUntil);
  const entries: MongoCompletionEntry[] = [];

  switch (context) {
    case 'pipeline':
      // At pipeline array level: suggest stage names
      entries.push(...buildStagesSuggestions());
      break;

    case 'match':
      // Inside $match: suggest query operators
      entries.push(...buildOperatorSuggestions());
      if (data && Array.isArray(data.collections)) {
        entries.push(...buildFieldsSuggestions(data.collections));
        entries.push(...buildCollectionsSuggestions(data.collections));
      }
      break;

    case 'group':
      // Inside $group: suggest accumulators for computed fields
      entries.push(...buildAccumulatorSuggestions());
      entries.push(...buildExpressionSuggestions());
      if (data && Array.isArray(data.collections)) {
        entries.push(...buildFieldsSuggestions(data.collections));
      }
      break;

    case 'project':
    case 'addfields':
      // Inside $project/$addFields: suggest expressions
      entries.push(...buildExpressionSuggestions());
      if (data && Array.isArray(data.collections)) {
        entries.push(...buildFieldsSuggestions(data.collections));
      }
      break;

    case 'expression':
      // After $: suggest all operators
      entries.push(...buildOperatorSuggestions());
      entries.push(...buildUpdateOperatorSuggestions());
      entries.push(...buildAccumulatorSuggestions());
      entries.push(...buildExpressionSuggestions());
      break;

    default:
      // General context: suggest everything
      entries.push(...buildStagesSuggestions());
      entries.push(...buildOperatorSuggestions());
      entries.push(...buildUpdateOperatorSuggestions());
      entries.push(...buildAccumulatorSuggestions());
      entries.push(...buildExpressionSuggestions());
      if (data && Array.isArray(data.collections)) {
        entries.push(...buildFieldsSuggestions(data.collections));
        entries.push(...buildCollectionsSuggestions(data.collections));
      }
      break;
  }

  return entries;
}
