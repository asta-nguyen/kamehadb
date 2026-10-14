package engines

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
)

const (
	MaxGUIResultBytes     = 8 << 20
	MaxPreviewResultBytes = 2 << 20
	MaxPreviewRows        = 1000
	DefaultPreviewRows    = 100
	MaxPreviewCursorBytes = 8 << 10
	resultEnvelopeReserve = MaxPreviewCursorBytes + 512
	LimitReasonRows       = "rows"
	LimitReasonBytes      = "bytes"
)

var errResultBudget = errors.New("result byte budget exhausted")

// ResultBudget admits complete rows before retaining them. The small envelope
// reserve covers final timings, limit metadata and a bounded paging cursor.
// JSON encoding happens per row, never as another complete result copy.
type ResultBudget struct {
	parent   context.Context
	cancel   context.CancelFunc
	maxRows  int64
	maxBytes int64
	bytes    int64
	rows     int64
	reason   string
}

func NewResultBudget(parent context.Context, cancel context.CancelFunc, maxRows, maxBytes int64) *ResultBudget {
	return &ResultBudget{parent: parent, cancel: cancel, maxRows: maxRows, maxBytes: maxBytes, bytes: resultEnvelopeReserve + 2}
}

// Columns consume the same budget as rows, so wide metadata cannot bypass the
// transport bound even when the query returns no records.
func (b *ResultBudget) SetColumns(columns []QueryColumn) error {
	// PostgreSQL previews annotate unknown nullability after collection; bill
	// the larger nullable form so that annotation cannot breach the wire cap.
	billable := append([]QueryColumn(nil), columns...)
	unknown := false
	for i := range billable {
		if billable[i].Nullable == nil {
			billable[i].Nullable = &unknown
		}
	}
	n, err := encodedSize(billable, b.maxBytes-b.bytes)
	if err != nil {
		b.cancel()
		return fmt.Errorf("query column metadata exceeds the result byte limit: %w", err)
	}
	b.bytes += n
	return nil
}

func (b *ResultBudget) StopRows() { b.stop(LimitReasonRows) }

func (b *ResultBudget) stop(reason string) {
	b.reason = reason
	b.cancel()
}

// A false admission is intentional truncation, not a malformed value. Keep
// every accepted value intact so editing and export never use clipped data.
func (b *ResultBudget) Add(row map[string]any) (bool, error) {
	if b.maxRows > 0 && b.rows >= b.maxRows {
		b.StopRows()
		return false, nil
	}
	// Reject oversized scalar payloads before encoding can allocate their
	// escaped/base64 copy. Nested driver values still cost at most one row.
	remaining := b.maxBytes - b.bytes - 1
	var scalarBytes int64
	for _, value := range row {
		switch v := value.(type) {
		case string:
			scalarBytes += int64(len(v))
		case []byte:
			scalarBytes += int64(len(v))
		}
		if scalarBytes > remaining {
			b.stop(LimitReasonBytes)
			return false, nil
		}
	}
	n, err := encodedSize(row, remaining)
	if errors.Is(err, errResultBudget) {
		b.stop(LimitReasonBytes)
		return false, nil
	}
	if err != nil {
		b.cancel()
		return false, err
	}
	b.bytes += n + 1
	b.rows++
	return true, nil
}

// Drivers report our early stop as cancellation. Preserve genuine parent
// cancellation instead of turning a user's cancelled request into success.
func (b *ResultBudget) Error(err error) error {
	if b.parent.Err() != nil {
		return b.parent.Err()
	}
	if b.reason != "" {
		return nil
	}
	return err
}

func (b *ResultBudget) Apply(result *QueryResult) *QueryResult {
	result.PayloadBytes = b.bytes
	result.LimitReason = b.reason
	more := b.reason != "" && b.rows > 0
	result.HasMore = &more
	if b.reason != "" {
		result.Truncated = true
	}
	return result
}

type sizeWriter struct {
	limit int64
	n     int64
}

func (w *sizeWriter) Write(p []byte) (int, error) {
	if int64(len(p)) > w.limit-w.n {
		return 0, errResultBudget
	}
	w.n += int64(len(p))
	return len(p), nil
}

func encodedSize(value any, limit int64) (int64, error) {
	w := &sizeWriter{limit: limit}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		return 0, err
	}
	return w.n, nil
}

// Validate at the adapter boundary as well as the UI: a malicious or stale
// client must not turn a preview into an unlimited table scan.
func PreviewBounds(input PreviewRowsInput) (limit, offset int64, err error) {
	limit = DefaultPreviewRows
	if input.Limit != nil {
		limit = *input.Limit
	}
	if input.Offset != nil {
		offset = *input.Offset
	}
	if limit <= 0 || offset < 0 || offset > math.MaxInt64-MaxPreviewRows-1 {
		return 0, 0, errors.New("preview limit must be positive and offset must be non-negative and within the paging range")
	}
	if limit > MaxPreviewRows {
		limit = MaxPreviewRows
	}
	return limit, offset, nil
}

var _ io.Writer = (*sizeWriter)(nil)
