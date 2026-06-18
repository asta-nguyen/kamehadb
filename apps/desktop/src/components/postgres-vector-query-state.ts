import type { PostgresVectorSearchResult } from '@kamehadb/shared';

export type PostgresVectorMode = 'similar' | 'raw';

export type PgVectorState = {
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly mode: PostgresVectorMode;
  readonly vectorText: string;
  readonly filterText: string;
  readonly metric: 'l2' | 'cosine' | 'inner_product';
  readonly limit: number;
  readonly running: boolean;
  readonly error: string | null;
  readonly info: string | null;
  readonly result: PostgresVectorSearchResult | null;
};

export type PgVectorAction =
  | { type: 'setSchema'; value: string }
  | { type: 'setTable'; value: string }
  | { type: 'setColumn'; value: string }
  | { type: 'setMode'; value: PostgresVectorMode }
  | { type: 'setVectorText'; value: string }
  | { type: 'setFilterText'; value: string }
  | { type: 'setMetric'; value: 'l2' | 'cosine' | 'inner_product' }
  | { type: 'setLimit'; value: number }
  | { type: 'startRun' }
  | { type: 'finishRun'; result: PostgresVectorSearchResult; info?: string }
  | { type: 'failRun'; error: string }
  | { type: 'endRun' }
  | { type: 'setError'; value: string | null };

export function pgVectorReducer(state: PgVectorState, action: PgVectorAction): PgVectorState {
  switch (action.type) {
    case 'setSchema':
      return { ...state, schema: action.value, table: '', column: '', result: null, info: null, error: null };
    case 'setTable':
      return { ...state, table: action.value, column: '', result: null, info: null, error: null };
    case 'setColumn':
      return { ...state, column: action.value, result: null, info: null, error: null };
    case 'setMode':
      return { ...state, mode: action.value, result: null, info: null, error: null };
    case 'setVectorText':
      return { ...state, vectorText: action.value };
    case 'setFilterText':
      return { ...state, filterText: action.value };
    case 'setMetric':
      return { ...state, metric: action.value };
    case 'setLimit':
      return { ...state, limit: action.value };
    case 'startRun':
      return { ...state, running: true, error: null, info: null };
    case 'finishRun':
      return { ...state, running: false, result: action.result, info: action.info ?? null };
    case 'failRun':
      return { ...state, running: false, error: action.error };
    case 'endRun':
      return { ...state, running: false };
    case 'setError':
      return { ...state, error: action.value };
  }
}
