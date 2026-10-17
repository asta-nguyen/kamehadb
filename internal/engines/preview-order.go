package engines

import "strings"

// PreviewOrderBy composes the ORDER BY terms of a preview page: the requested
// sort column first, then every primary-key column (in declared order) that is
// not already the sort column. Equal sort values otherwise tie, and a database
// may order ties differently on each request, so OFFSET pages would repeat or
// skip rows. With the whole key present the order is total, so page boundaries
// are exact. quote applies the dialect's identifier quoting. The result is empty
// when there is neither a sort column nor a key, so a keyless table keeps its
// natural order instead of getting an invented one.
func PreviewOrderBy(columns []ColumnInfo, sortColumn, direction string, quote func(string) string) string {
	var terms []string
	if sortColumn != "" {
		dir := "ASC"
		if direction == "desc" {
			dir = "DESC"
		}
		terms = append(terms, quote(sortColumn)+" "+dir)
	}
	for _, column := range columns {
		if column.PrimaryKey && column.Name != sortColumn {
			terms = append(terms, quote(column.Name)+" ASC")
		}
	}
	return strings.Join(terms, ", ")
}
