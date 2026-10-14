import type { ReactElement } from 'react';
import type { QueryResult } from '@kamehadb/shared';
import { Badge } from '@/components/ui/badge';

// A byte stop can look like an empty table. Explain it explicitly without
// presenting a partial cell as safe to copy, edit, or export.
export function ResultLimitNotice({
  result,
}: {
  result: Pick<QueryResult, 'limitReason' | 'rowCount'>;
}): ReactElement | null {
  if (result.limitReason !== 'bytes') return null;
  return (
    <div role="status" className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
      <Badge variant="secondary">Size limit</Badge>
      <span>
        {result.rowCount === 0
          ? 'No complete row fits the result size limit. Select fewer or smaller columns.'
          : 'Result size limit reached. Displayed rows are complete; remaining rows were not loaded.'}
      </span>
    </div>
  );
}
