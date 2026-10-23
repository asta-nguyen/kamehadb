package engines

import "database/sql"

// CollectSQLRows keeps driver-specific metadata/value normalization outside the
// common admission loop. Budget cancellation happens before callers close the
// cursor, avoiding a drain of the rows the GUI will never display.
func CollectSQLRows(rows *sql.Rows, columns []QueryColumn, maxRows int64, normalize func(any) any, budget *ResultBudget) ([]QueryColumn, []map[string]any, bool, error) {
	if budget != nil {
		if err := budget.SetColumns(columns); err != nil {
			return nil, nil, false, err
		}
	}
	out := make([]map[string]any, 0, 64)
	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for i := range values {
		pointers[i] = &values[i]
	}
	truncated := false
	for rows.Next() {
		if maxRows > 0 && int64(len(out)) >= maxRows {
			truncated = true
			if budget != nil {
				budget.StopRows()
			}
			break
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, nil, false, err
		}
		row := make(map[string]any, len(columns))
		for i, column := range columns {
			row[column.Name] = JSONSafeInteger(normalize(values[i]))
		}
		if budget != nil {
			accepted, err := budget.Add(row)
			if err != nil {
				return nil, nil, false, err
			}
			if !accepted {
				truncated = true
				break
			}
		}
		out = append(out, row)
	}
	err := rows.Err()
	if budget != nil {
		err = budget.Error(err)
	}
	return columns, out, truncated, err
}
