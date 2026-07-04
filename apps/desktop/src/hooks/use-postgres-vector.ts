import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/query-keys';
import { createVecHooks } from './create-vec-hooks';

const {
  useCapabilities: usePostgresVectorCapabilities,
  useSearch: usePostgresVectorSearch,
  useSampleMutation: usePostgresVectorSampleMutation,
  useSampleQuery: usePostgresVectorSample,
} = createVecHooks({
  capabilitiesKey: QUERY_KEYS.POSTGRES_VECTOR_CAPABILITIES,
  capabilitiesFn: api.getPostgresVectorCapabilities,
  searchFn: api.searchPostgresVector,
  sampleFn: api.getPostgresVectorSample,
  sampleQueryKey: QUERY_KEYS.POSTGRES_VECTOR_SAMPLE,
  sampleQueryFn: api.getPostgresVectorSample,
});

export {
  usePostgresVectorCapabilities,
  usePostgresVectorSearch,
  usePostgresVectorSample,
  usePostgresVectorSampleMutation,
};
