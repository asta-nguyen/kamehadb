package postgres

import (
	"context"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
)

// IndexStats, TableStats, DatabaseSizes, ActiveConnections — the optional
// SqlAdapter capabilities (Statser/SessionLister interfaces in engines).

func (a *Adapter) GetIndexStats(ctx context.Context, tableID string) ([]engines.IndexStats, error) {
	schema, table := splitTableID(tableID)
	const sql = `SELECT
		i.relname as name,
		t.relname as table_name,
		a.attname as column_name,
		ix.indisunique as unique_index,
		ix.indisprimary as primary_index,
		am.amname as method,
		pg_relation_size(i.oid) as size_bytes
	FROM pg_index ix
	JOIN pg_class i ON i.oid = ix.indexrelid
	JOIN pg_class t ON t.oid = ix.indrelid
	JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
	JOIN pg_namespace n ON n.oid = t.relnamespace
	JOIN pg_am am ON am.oid = i.relam
	WHERE n.nspname = $1 AND t.relname = $2
	ORDER BY i.relname, a.attnum`
	res, err := a.collect(ctx, sql, []any{schema, table}, 0)
	if err != nil {
		return nil, err
	}
	idxMap := map[string]int{}
	var out []engines.IndexStats
	for _, r := range res.rows {
		name := str(r, 0)
		idx, ok := idxMap[name]
		if !ok {
			idx = len(out)
			idxMap[name] = idx
			out = append(out, engines.IndexStats{
				Name:      name,
				Table:     str(r, 1),
				Unique:    boolv(r, 3),
				Primary:   boolv(r, 4),
				Method:    str(r, 5),
				SizeBytes: toInt64(r[6]),
			})
		}
		out[idx].Columns = append(out[idx].Columns, str(r, 2))
	}
	return out, nil
}

func (a *Adapter) GetTableStats(ctx context.Context, tableID string) (*engines.TableStats, error) {
	schema, table := splitTableID(tableID)
	const sql = `SELECT
		t.relname as name,
		n.nspname as schema,
		s.n_live_tup as row_estimate,
		pg_total_relation_size(t.oid) as total_bytes,
		COALESCE(pg_indexes_size(t.oid), 0) as indexes_bytes,
		COALESCE(GREATEST(pg_total_relation_size(t.oid) - pg_indexes_size(t.oid) - pg_table_size(t.oid), 0), 0) as toast_bytes,
		s.last_vacuum,
		s.last_autovacuum,
		s.last_analyze,
		s.last_autoanalyze,
		s.vacuum_count,
		s.autovacuum_count,
		COALESCE(s.n_live_tup, 0) as n_live_tup,
		COALESCE(s.n_dead_tup, 0) as n_dead_tup,
		pg_table_size(t.oid) as table_bytes
	FROM pg_stat_user_tables s
	JOIN pg_class t ON t.oid = s.relid
	JOIN pg_namespace n ON n.oid = t.relnamespace
	WHERE n.nspname = $1 AND t.relname = $2`
	res, err := a.collect(ctx, sql, []any{schema, table}, 0)
	if err != nil {
		return nil, err
	}
	stats := &engines.TableStats{TableID: tableID, Name: table, Schema: schema}
	if len(res.rows) == 0 {
		return stats, nil
	}
	r := res.rows[0]
	if n := str(r, 0); n != "" {
		stats.Name = n
	}
	if s := str(r, 1); s != "" {
		stats.Schema = s
	}
	stats.RowEstimate = toInt64(r[2])
	stats.TotalBytes = toInt64(r[3])
	stats.IndexesBytes = toInt64(r[4])
	stats.ToastBytes = toInt64(r[5])
	stats.LastVacuum = strP(r, 6)
	stats.LastAutovacuum = strP(r, 7)
	stats.LastAnalyze = strP(r, 8)
	stats.LastAutoanalyze = strP(r, 9)
	stats.VacuumCount = toInt64(r[10])
	stats.AutovacuumCount = toInt64(r[11])
	stats.NLiveTup = toInt64(r[12])
	stats.NDeadTup = toInt64(r[13])
	// PostgreSQL has no cheap exact bloat measure (pgstattuple scans the table),
	// so estimate the dead tuples' share of the heap from autovacuum's counters.
	if tuples := stats.NLiveTup + stats.NDeadTup; tuples > 0 && stats.NDeadTup > 0 {
		deadShare := float64(stats.NDeadTup) / float64(tuples)
		stats.BloatPercent = 100 * deadShare
		stats.BloatBytes = int64(float64(toInt64(r[14])) * deadShare)
	}
	return stats, nil
}

func (a *Adapter) GetDatabaseSizes(ctx context.Context, schema *string) ([]engines.DatabaseSize, error) {
	const sql = `SELECT
		n.nspname as schema,
		c.relname as table,
		pg_relation_size(c.oid) as size_bytes,
		COALESCE(pg_indexes_size(c.oid), 0) as index_bytes,
		pg_total_relation_size(c.oid) as total_bytes,
		s.n_live_tup as row_estimate
	FROM pg_class c
	JOIN pg_namespace n ON n.oid = c.relnamespace
	LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
	WHERE c.relkind = 'r'
		AND n.nspname NOT IN ('pg_catalog', 'information_schema')
		AND n.nspname = COALESCE($1, n.nspname)
	ORDER BY pg_total_relation_size(c.oid) DESC
	LIMIT 100`
	var arg any
	if schema != nil && *schema != "" {
		arg = *schema
	}
	res, err := a.collect(ctx, sql, []any{arg}, 0)
	if err != nil {
		return nil, err
	}
	out := make([]engines.DatabaseSize, len(res.rows))
	for i, r := range res.rows {
		out[i] = engines.DatabaseSize{
			Schema:      str(r, 0),
			Table:       str(r, 1),
			SizeBytes:   toInt64(r[2]),
			IndexBytes:  toInt64(r[3]),
			TotalBytes:  toInt64(r[4]),
			RowEstimate: toInt64(r[5]),
		}
	}
	return out, nil
}

func (a *Adapter) GetActiveConnections(ctx context.Context) ([]engines.ConnectionInfo, error) {
	const sql = `SELECT
		pid,
		usename,
		application_name as applicationName,
		client_addr::text as clientAddr,
		backend_start::text as backendStart,
		state,
		query,
		query_start::text as queryStart,
		wait_event_type as waitEventType,
		wait_event as waitEvent,
		EXTRACT(EPOCH FROM (now() - query_start))::bigint as durationSeconds
	FROM pg_stat_activity
	WHERE datname = current_database()
	ORDER BY state, query_start`
	res, err := a.collect(ctx, sql, nil, 0)
	if err != nil {
		return nil, err
	}
	out := make([]engines.ConnectionInfo, len(res.rows))
	for i, r := range res.rows {
		out[i] = engines.ConnectionInfo{
			PID:             toInt64(r[0]),
			Usename:         str(r, 1),
			ApplicationName: str(r, 2),
			ClientAddr:      strP(r, 3),
			BackendStart:    str(r, 4),
			State:           str(r, 5),
			Query:           strP(r, 6),
			QueryStart:      strP(r, 7),
			WaitEventType:   strP(r, 8),
			WaitEvent:       strP(r, 9),
			DurationSeconds: floatv(r, 10),
		}
	}
	return out, nil
}
