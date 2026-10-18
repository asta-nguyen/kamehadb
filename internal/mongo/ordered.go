package mongo

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// maxOrderedDepth mirrors MongoDB's own 100-level document nesting limit, so a
// runaway input cannot recurse the parser without bound.
const maxOrderedDepth = 100

var errOrderedTooDeep = fmt.Errorf("JSON is nested deeper than %d levels", maxOrderedDepth)

// ParseOrderedDocument decodes one JSON object into a bson.D that keeps key order
// at every depth. Wails decodes request bodies into Go maps, which discard the
// order; a compound sort, a compound index key, or the output field order of
// $addFields would then reach the server in a random order. The frontend sends
// the JSON text instead and this parser keeps it.
//
// It is not bson.D.UnmarshalJSON on purpose: that decoder turns [] into nil,
// which BSON encodes as null, so {"$in": []} would silently change meaning. Here
// empty arrays and objects stay empty. Scalars keep the types encoding/json
// gives map[string]any (numbers are float64), and extended JSON such as $oid or
// $date is deliberately not interpreted, so the BSON is unchanged apart from order.
func ParseOrderedDocument(text string) (bson.D, error) {
	p := newOrderedParser(text)
	if err := p.expect('{', "a JSON object"); err != nil {
		return nil, err
	}
	doc, err := p.object(1)
	if err != nil {
		return nil, err
	}
	return doc, p.finish()
}

// ParseOrderedPipeline decodes a JSON array of stage objects, keeping key order
// inside every stage.
func ParseOrderedPipeline(text string) ([]bson.D, error) {
	p := newOrderedParser(text)
	if err := p.expect('[', "a JSON array of stages"); err != nil {
		return nil, err
	}
	stages := []bson.D{}
	for p.dec.More() {
		if err := p.expect('{', fmt.Sprintf("pipeline stage %d to be a JSON object", len(stages)+1)); err != nil {
			return nil, err
		}
		stage, err := p.object(2)
		if err != nil {
			return nil, err
		}
		stages = append(stages, stage)
	}
	if _, err := p.dec.Token(); err != nil { // the closing ]
		return nil, err
	}
	return stages, p.finish()
}

type orderedParser struct{ dec *json.Decoder }

func newOrderedParser(text string) *orderedParser {
	return &orderedParser{dec: json.NewDecoder(strings.NewReader(text))}
}

// expect consumes the next token and requires it to be the given opening delimiter.
func (p *orderedParser) expect(open json.Delim, what string) error {
	tok, err := p.dec.Token()
	if err != nil {
		return err
	}
	if delim, ok := tok.(json.Delim); !ok || delim != open {
		return fmt.Errorf("expected %s", what)
	}
	return nil
}

// finish rejects anything after the first complete JSON value.
func (p *orderedParser) finish() error {
	_, err := p.dec.Token()
	switch {
	case errors.Is(err, io.EOF):
		return nil
	case err != nil:
		return err
	}
	return errors.New("unexpected data after the JSON value")
}

// value reads one JSON value; objects become bson.D and arrays bson.A.
func (p *orderedParser) value(depth int) (any, error) {
	tok, err := p.dec.Token()
	if err != nil {
		return nil, err
	}
	delim, isDelim := tok.(json.Delim)
	if !isDelim {
		return tok, nil // string, float64, bool or nil
	}
	if depth+1 > maxOrderedDepth {
		return nil, errOrderedTooDeep
	}
	switch delim {
	case '{':
		return p.object(depth + 1)
	case '[':
		return p.array(depth + 1)
	}
	return nil, fmt.Errorf("unexpected %q in JSON", rune(delim))
}

// object reads members up to and including the closing brace; the opening brace
// is already consumed.
func (p *orderedParser) object(depth int) (bson.D, error) {
	doc := bson.D{}
	for p.dec.More() {
		keyToken, err := p.dec.Token()
		if err != nil {
			return nil, err
		}
		key, ok := keyToken.(string)
		if !ok {
			return nil, errors.New("JSON object key must be a string")
		}
		value, err := p.value(depth)
		if err != nil {
			return nil, err
		}
		doc = append(doc, bson.E{Key: key, Value: value})
	}
	if _, err := p.dec.Token(); err != nil { // the closing }
		return nil, err
	}
	return doc, nil
}

// array reads elements up to and including the closing bracket. The result is
// never nil, so an empty array encodes as [] rather than null.
func (p *orderedParser) array(depth int) (bson.A, error) {
	items := bson.A{}
	for p.dec.More() {
		item, err := p.value(depth)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if _, err := p.dec.Token(); err != nil { // the closing ]
		return nil, err
	}
	return items, nil
}
