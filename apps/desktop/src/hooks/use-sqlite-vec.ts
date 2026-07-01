import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { createVecHooks } from './create-vec-hooks';

const {
  useCapabilities: useSqliteVecCapabilities,
  useSearch: useSqliteVecSearch,
  useSampleMutation: useSqliteVecSample,
  useSampleQuery: useSqliteVecVectorsSample,
} = createVecHooks({
  capabilitiesKey: QUERY_KEYS.SQLITE_VEC_CAPABILITIES,
  capabilitiesFn: api.getSqliteVecCapabilities,
  searchFn: api.searchSqliteVec,
  sampleFn: api.sampleSqliteVec,
  sampleQueryKey: QUERY_KEYS.SQLITE_VEC_VECTORS_SAMPLE,
  sampleQueryFn: api.sampleSqliteVecVectors,
});

export { useSqliteVecCapabilities, useSqliteVecSearch, useSqliteVecSample, useSqliteVecVectorsSample };
