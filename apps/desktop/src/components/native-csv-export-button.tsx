import { useEffect, useRef, useState, type ReactElement } from 'react';
import { KIND, isQuerySafe, safeErrorMessage } from '@kamehadb/shared';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { useConnections } from '@/hooks/use-connections';
import { api } from '@/lib/api';
import { nativeTableExportQuery } from '@/lib/native-export';
import { toastError, toastInfo, toastSuccess } from '@/lib/toast';

type NativeCSVExportProps = { connectionId: string; asMenuItem?: boolean } & (
  | { query: string; tableId?: never }
  | { tableId: string; query?: never }
);

// Keep native full export separate from displayed-row downloads. The job ID
// exists before the binding responds, and closing its view cancels that job.
export function NativeCSVExportButton(props: NativeCSVExportProps): ReactElement | null {
  const { data: connections } = useConnections();
  const kind = connections?.find((connection) => connection.id === props.connectionId)?.kind;
  const [phase, setPhase] = useState<'idle' | 'selecting' | 'exporting'>('idle');
  const job = useRef<string | null>(null);
  const mounted = useRef(true);
  // A connection change also ends ownership: a previously opened dialog must
  // not launch its old query or clear a newer connection's export state.
  useEffect(() => {
    mounted.current = true;
    setPhase('idle');
    return () => {
      mounted.current = false;
      const id = job.current;
      job.current = null;
      if (id) void api.cancelExport(id).catch(() => undefined);
    };
  }, [props.connectionId]);

  if (kind !== KIND.POSTGRES && kind !== KIND.SQLITE) return null;
  const query = props.query ?? nativeTableExportQuery(props.tableId, kind);
  const label = props.query === undefined ? 'Export whole table as CSV' : 'Export full query as CSV';
  const title =
    props.query === undefined
      ? 'Export the whole table, without preview filters or row limits'
      : 'Stream the original read-only query; keeps any LIMIT written in your SQL';

  // Wait for destination selection before enabling Cancel or running SQL.
  // The guard also handles a tab closing while its native dialog was open.
  const start = async (): Promise<void> => {
    if (job.current) return;
    const id = crypto.randomUUID();
    job.current = id;
    const isCurrent = (): boolean => mounted.current && job.current === id;
    setPhase('selecting');
    try {
      const result = await api.exportQueryCSV(props.connectionId, { query }, id, () => {
        if (!isCurrent()) return false;
        setPhase('exporting');
        return true;
      });
      if (!result || !isCurrent()) return;
      if (result.cancelled) toastInfo('Export cancelled; the previous destination was kept');
      else toastSuccess(`Exported ${result.rows.toLocaleString()} rows to ${result.path}`);
    } catch (error) {
      if (isCurrent()) toastError(safeErrorMessage(error, 'CSV export failed'));
    } finally {
      if (job.current === id) {
        job.current = null;
        if (mounted.current) setPhase('idle');
      }
    }
  };
  const cancel = (): void => {
    const id = job.current;
    if (id)
      void api.cancelExport(id).catch((error: unknown) => {
        if (mounted.current && job.current === id) {
          toastError(safeErrorMessage(error, 'Could not cancel export'));
        }
      });
  };

  const labelText = phase === 'idle' ? label : phase === 'selecting' ? 'Choose destination…' : 'Exporting…';
  const unavailable = phase !== 'idle' || !query.trim() || !isQuerySafe(query).safe;

  // Menu mode renders a dropdown item; keeping the menu open (onSelect
  // preventDefault) leaves Cancel reachable while the export job runs.
  if (props.asMenuItem) {
    return (
      <>
        <DropdownMenuItem
          title={title}
          disabled={unavailable}
          onSelect={(event) => event.preventDefault()}
          onClick={() => void start()}
        >
          {phase !== 'idle' && <Spinner size="sm" />}
          {labelText}
        </DropdownMenuItem>
        {phase === 'exporting' && (
          <DropdownMenuItem onSelect={(event) => event.preventDefault()} onClick={cancel}>
            Cancel export
          </DropdownMenuItem>
        )}
      </>
    );
  }

  return (
    <div className="flex items-center gap-1" role="status">
      <Button variant="ghost" size="sm" title={title} disabled={unavailable} onClick={() => void start()}>
        {phase !== 'idle' && <Spinner size="sm" />}
        {labelText}
      </Button>
      {phase === 'exporting' && (
        <Button variant="ghost" size="sm" onClick={cancel}>
          Cancel export
        </Button>
      )}
    </div>
  );
}
