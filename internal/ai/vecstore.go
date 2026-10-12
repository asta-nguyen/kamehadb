package ai

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// Port of ai/vec-store.ts. The original used sqlite-vec's vec0 virtual table;
// here vectors are float32 blobs in schema_embedding_vectors and the KNN is a
// brute-force L2 scan — for a schema index this is a few hundred rows.

func inferColumnPurpose(col engines.ColumnInfo) string {
	n := strings.ToLower(col.Name)
	switch {
	case col.ForeignKey != nil:
		return fmt.Sprintf("References %s(%s)", col.ForeignKey.Table, col.ForeignKey.Column)
	case n == "id":
		return "Primary key, unique row identifier"
	case strings.HasSuffix(n, "_id"):
		return "Foreign key reference to related entity"
	case n == "name" || n == "title":
		return "Human-readable label or display name"
	case n == "email" || strings.HasSuffix(n, "_email"):
		return "Email address"
	case strings.Contains(n, "phone") || strings.Contains(n, "mobile") || strings.Contains(n, "telephone"):
		return "Phone number"
	case strings.Contains(n, "address") || n == "street" || n == "city" || n == "state" ||
		strings.Contains(n, "zip") || n == "country" || n == "region":
		return "Address or location component"
	case n == "price" || n == "cost" || n == "amount" || n == "total" || n == "fee" ||
		n == "salary" || n == "rate" || strings.Contains(n, "price") || strings.Contains(n, "amount"):
		return "Monetary value"
	case n == "created_at" || n == "updated_at" || n == "deleted_at" || strings.Contains(n, "date") ||
		strings.Contains(n, "timestamp") || n == "created_date" || n == "modified_date":
		return "Timestamp or date value"
	case n == "status" || strings.HasSuffix(n, "_status") || n == "state":
		return "Current status or state of the record"
	case n == "type" || n == "category" || n == "kind" || strings.HasSuffix(n, "_type") || strings.HasSuffix(n, "_category"):
		return "Classification or category label"
	case n == "description" || n == "desc" || n == "comment" || n == "notes" || n == "note" || strings.HasSuffix(n, "_description"):
		return "Detailed textual description or notes"
	case strings.Contains(n, "url") || strings.Contains(n, "link") || n == "website" || n == "web":
		return "URL or web link"
	case n == "count" || n == "quantity" || n == "qty" || strings.HasSuffix(n, "_count") || strings.HasSuffix(n, "_quantity"):
		return "Numeric count or quantity"
	case n == "active" || n == "enabled" || n == "disabled" || strings.HasPrefix(n, "is_") ||
		strings.HasPrefix(n, "has_") || strings.HasSuffix(n, "_flag"):
		return "Boolean indicator or flag"
	case strings.Contains(n, "password") || n == "pwd" || n == "secret":
		return "Sensitive credential (handle with care)"
	case n == "token" || strings.HasSuffix(n, "_token"):
		return "Authentication or session token"
	case n == "slug" || strings.HasSuffix(n, "_slug"):
		return "URL-friendly unique identifier"
	case n == "code" || strings.HasSuffix(n, "_code"):
		return "Short code or enumerated value"
	}
	return col.Type
}

func inferTablePurpose(table engines.TableInfo, columns []engines.ColumnInfo) string {
	name := strings.ReplaceAll(strings.ToLower(table.Name), "_", " ")
	fkCount := 0
	for _, c := range columns {
		if c.ForeignKey != nil {
			fkCount++
		}
	}
	if fkCount >= 2 && len(columns) <= 6 {
		return "Junction or association table linking multiple related entities"
	}
	if strings.HasSuffix(name, "s") {
		return "Stores " + name[:len(name)-1] + " records"
	}
	return "Contains " + name + " data"
}

// buildTableDdl mirrors vec-store.ts's own copy — note it deliberately omits
// the schema qualifier on the index line, unlike schema-context's renderer.
func buildTableDdl(table engines.TableInfo, columns []engines.ColumnInfo, indexes []engines.IndexInfo) string {
	var lines []string
	name := table.Name
	if table.Schema != "" {
		name = table.Schema + "." + table.Name
	}
	lines = append(lines, fmt.Sprintf("CREATE TABLE %s (", name))
	colLines := make([]string, 0, len(columns))
	for _, col := range columns {
		parts := []string{fmt.Sprintf("  %s %s", col.Name, col.Type)}
		if !col.Nullable {
			parts = append(parts, "NOT NULL")
		}
		if col.Default != nil {
			parts = append(parts, "DEFAULT "+*col.Default)
		}
		if col.PrimaryKey {
			parts = append(parts, "PRIMARY KEY")
		}
		if col.ForeignKey != nil {
			parts = append(parts, fmt.Sprintf("REFERENCES %s(%s)", col.ForeignKey.Table, col.ForeignKey.Column))
		}
		colLines = append(colLines, strings.Join(parts, " "))
	}
	lines = append(lines, strings.Join(colLines, ",\n"), ");")
	for _, idx := range indexes {
		if idx.Primary {
			continue
		}
		unique := ""
		if idx.Unique {
			unique = "UNIQUE "
		}
		lines = append(lines, fmt.Sprintf("CREATE %sINDEX %s ON %s (%s);", unique, idx.Name, table.Name, strings.Join(idx.Columns, ", ")))
	}
	return strings.Join(lines, "\n")
}

func buildEnrichedText(table engines.TableInfo, columns []engines.ColumnInfo, indexes []engines.IndexInfo) string {
	fullName := table.Name
	if table.Schema != "" {
		fullName = table.Schema + "." + table.Name
	}
	var lines []string
	lines = append(lines, "Table: "+fullName)
	lines = append(lines, "Purpose: "+inferTablePurpose(table, columns))
	lines = append(lines, "", "Columns:")
	for _, col := range columns {
		lines = append(lines, fmt.Sprintf("- %s (%s): %s", col.Name, col.Type, inferColumnPurpose(col)))
	}
	lines = append(lines, "", "DDL:", buildTableDdl(table, columns, indexes))
	return strings.Join(lines, "\n")
}

func computeTableHash(table engines.TableInfo, columns []engines.ColumnInfo, indexes []engines.IndexInfo) string {
	h := sha256.New()
	h.Write([]byte(table.Schema))
	h.Write([]byte(table.Name))
	for _, col := range columns {
		h.Write([]byte(col.Name))
		h.Write([]byte(col.Type))
		if col.Nullable {
			h.Write([]byte{'1'})
		} else {
			h.Write([]byte{'0'})
		}
		if col.Default != nil {
			h.Write([]byte(*col.Default))
		}
		if col.PrimaryKey {
			h.Write([]byte{'1'})
		} else {
			h.Write([]byte{'0'})
		}
		if col.ForeignKey != nil {
			h.Write([]byte(col.ForeignKey.Table + "." + col.ForeignKey.Column))
		}
		h.Write([]byte{0})
	}
	for _, idx := range indexes {
		h.Write([]byte(idx.Name))
		h.Write([]byte(strings.Join(idx.Columns, ",")))
		if idx.Unique {
			h.Write([]byte{'1'})
		} else {
			h.Write([]byte{'0'})
		}
		if idx.Primary {
			h.Write([]byte{'1'})
		} else {
			h.Write([]byte{'0'})
		}
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

func floatsToBlob(vec []float64) []byte {
	blob := make([]byte, len(vec)*4)
	for i, v := range vec {
		binary.LittleEndian.PutUint32(blob[i*4:], math.Float32bits(float32(v)))
	}
	return blob
}

func blobToFloats(blob []byte) []float64 {
	vec := make([]float64, len(blob)/4)
	for i := range vec {
		vec[i] = float64(math.Float32frombits(binary.LittleEndian.Uint32(blob[i*4:])))
	}
	return vec
}

// l2Distance matches sqlite-vec's default `<=>` operator.
func l2Distance(a, b []float64) float64 {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	var sum float64
	for i := 0; i < n; i++ {
		d := a[i] - b[i]
		sum += d * d
	}
	return math.Sqrt(sum)
}

func deleteOrphanedRows(s *store.Store, connectionID string, validTableIDs map[string]bool) {
	ids, err := s.ListEmbeddingTableIDs(connectionID)
	if err != nil {
		return
	}
	for _, id := range ids {
		if !validTableIDs[id] {
			_ = s.DeleteEmbedding(connectionID, id)
			_ = s.DeleteEmbeddingVector(connectionID, id)
		}
	}
}

// BuildSchemaIndex embeds changed tables for a connection; returns the count
// of (re)embedded tables. Mirrors buildSchemaIndex including the hash-skip
// and orphan-prune behavior.
func BuildSchemaIndex(ctx context.Context, s *store.Store, adapter engines.SQLAdapter, connectionID, provider string, config ProviderConfig, force bool) (int, error) {
	schemas, err := adapter.ListSchemas(ctx, nil)
	if err != nil {
		return 0, err
	}
	type item struct {
		tableID  string
		enriched string
		hash     string
	}
	var items []item
	for _, schema := range schemas {
		tables, err := adapter.ListTables(ctx, &schema.Name)
		if err != nil {
			return 0, err
		}
		for _, table := range tables {
			columns, err := adapter.GetTableColumns(ctx, table.ID)
			if err != nil {
				return 0, err
			}
			indexes, err := adapter.GetTableIndexes(ctx, table.ID)
			if err != nil {
				return 0, err
			}
			items = append(items, item{
				tableID:  table.ID,
				enriched: buildEnrichedText(table, columns, indexes),
				hash:     computeTableHash(table, columns, indexes),
			})
		}
	}
	if len(items) == 0 {
		return 0, nil
	}

	var existing map[string]string
	if !force {
		existing = map[string]string{}
		refs, err := s.ListEmbeddingRefs(connectionID)
		if err != nil {
			return 0, err
		}
		for _, r := range refs {
			existing[r.TableID] = r.Hash
		}
	}

	var toEmbed []item
	for _, it := range items {
		if existing == nil || existing[it.tableID] != it.hash {
			toEmbed = append(toEmbed, it)
		}
	}

	valid := map[string]bool{}
	for _, it := range items {
		valid[it.tableID] = true
	}

	if len(toEmbed) == 0 {
		deleteOrphanedRows(s, connectionID, valid)
		return 0, nil
	}

	first := CreateEmbedding(ctx, provider, config, toEmbed[0].enriched, "")
	// Dimension-change reset, like ensureVecTable's DROP+DELETE.
	if rows, err := s.ListEmbeddingVectors(connectionID); err == nil {
		for _, r := range rows {
			if len(r.Blob)/4 != len(first) {
				_ = s.DeleteAllEmbeddingVectors()
				_ = s.DeleteAllEmbeddings()
				break
			}
		}
	}

	vectors := [][]float64{first}
	const batchSize = 20
	for i := 1; i < len(toEmbed); i += batchSize {
		end := i + batchSize
		if end > len(toEmbed) {
			end = len(toEmbed)
		}
		for _, it := range toEmbed[i:end] {
			vectors = append(vectors, CreateEmbedding(ctx, provider, config, it.enriched, ""))
		}
	}

	for i, it := range toEmbed {
		_ = s.DeleteEmbedding(connectionID, it.tableID)
		_ = s.DeleteEmbeddingVector(connectionID, it.tableID)
		if err := s.UpsertEmbedding(connectionID, it.tableID, it.enriched, it.hash); err != nil {
			return 0, err
		}
		if err := s.UpsertEmbeddingVector(connectionID, it.tableID, floatsToBlob(vectors[i])); err != nil {
			return 0, err
		}
	}

	if !force {
		deleteOrphanedRows(s, connectionID, valid)
	}
	return len(toEmbed), nil
}

// SchemaSearchHit is one ranked table.
type SchemaSearchHit struct {
	TableID string  `json:"tableId"`
	DDL     string  `json:"ddl"`
	Score   float64 `json:"score"`
}

// SearchRelevantSchema embeds the query and returns the top-K nearest tables.
func SearchRelevantSchema(ctx context.Context, s *store.Store, connectionID, query, provider string, config ProviderConfig, topK int) ([]SchemaSearchHit, error) {
	queryVec := CreateEmbedding(ctx, provider, config, query, "")
	rows, err := s.ListEmbeddingVectors(connectionID)
	if err != nil {
		return nil, err
	}
	type hit struct {
		SchemaSearchHit
		dist float64
	}
	hits := make([]hit, 0, len(rows))
	for _, r := range rows {
		d := l2Distance(queryVec, blobToFloats(r.Blob))
		hits = append(hits, hit{SchemaSearchHit{TableID: r.TableID, DDL: r.DDL, Score: 1 - d}, d})
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].dist < hits[j].dist })
	if len(hits) > topK {
		hits = hits[:topK]
	}
	out := make([]SchemaSearchHit, len(hits))
	for i, h := range hits {
		out[i] = h.SchemaSearchHit
	}
	return out, nil
}
