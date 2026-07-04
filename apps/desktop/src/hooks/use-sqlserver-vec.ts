import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { createVecHooks } from './create-vec-hooks';

const {
  useCapabilities: useSqlServerVecCapabilities,
  useSearch: useSqlServerVecSearch,
  useSampleMutation: useSqlServerVecSample,
  useSampleQuery: useSqlServerVecVectorsSample,
} = createVecHooks({
  capabilitiesKey: QUERY_KEYS.SQLSERVER_VEC_CAPABILITIES,
  capabilitiesFn: api.getSqlServerVecCapabilities,
  searchFn: api.searchSqlServerVec,
  sampleFn: api.sampleSqlServerVec,
  sampleQueryKey: QUERY_KEYS.SQLSERVER_VEC_VECTORS_SAMPLE,
  sampleQueryFn: api.sampleSqlServerVecVectors,
});

export { useSqlServerVecCapabilities, useSqlServerVecSearch, useSqlServerVecSample, useSqlServerVecVectorsSample };
