// Bundled static sample schema for the landing page ER diagram demo.
// This shape mirrors the CompletionsData type used by the desktop app's
// schema-graph.tsx so the demo is visually consistent with the real app.
// No API call is needed — the data is imported directly, so the graph
// loads instantly.

export type SampleColumn = {
  name: string;
  type: string;
  primaryKey: boolean;
  foreignKey?: { table: string; column: string; schema?: string };
};

export type SampleTable = {
  name: string;
  schema?: string;
  columns: SampleColumn[];
};

export type SampleSchema = {
  tables: SampleTable[];
};

// A small e-commerce schema with 5 tables and FK relationships.
// Chosen to demonstrate a representative ER diagram with self-references
// and multi-table joins without overwhelming the landing page canvas.
export const SAMPLE_SCHEMA: SampleSchema = {
  tables: [
    {
      name: 'users',
      schema: 'public',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'email', type: 'varchar', primaryKey: false },
        { name: 'name', type: 'varchar', primaryKey: false },
        { name: 'created_at', type: 'timestamp', primaryKey: false },
      ],
    },
    {
      name: 'categories',
      schema: 'public',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'name', type: 'varchar', primaryKey: false },
        {
          name: 'parent_id',
          type: 'uuid',
          primaryKey: false,
          foreignKey: { table: 'categories', column: 'id', schema: 'public' },
        },
      ],
    },
    {
      name: 'products',
      schema: 'public',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        { name: 'name', type: 'varchar', primaryKey: false },
        { name: 'price', type: 'numeric', primaryKey: false },
        {
          name: 'category_id',
          type: 'uuid',
          primaryKey: false,
          foreignKey: { table: 'categories', column: 'id', schema: 'public' },
        },
      ],
    },
    {
      name: 'orders',
      schema: 'public',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        {
          name: 'user_id',
          type: 'uuid',
          primaryKey: false,
          foreignKey: { table: 'users', column: 'id', schema: 'public' },
        },
        { name: 'total', type: 'numeric', primaryKey: false },
        { name: 'created_at', type: 'timestamp', primaryKey: false },
      ],
    },
    {
      name: 'reviews',
      schema: 'public',
      columns: [
        { name: 'id', type: 'uuid', primaryKey: true },
        {
          name: 'product_id',
          type: 'uuid',
          primaryKey: false,
          foreignKey: { table: 'products', column: 'id', schema: 'public' },
        },
        {
          name: 'user_id',
          type: 'uuid',
          primaryKey: false,
          foreignKey: { table: 'users', column: 'id', schema: 'public' },
        },
        { name: 'rating', type: 'integer', primaryKey: false },
        { name: 'comment', type: 'text', primaryKey: false },
      ],
    },
  ],
};
