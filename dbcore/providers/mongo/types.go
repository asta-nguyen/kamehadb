package mongo

import db "github.com/asta-nguyen/kamehadb/dbcore/mongo"

// Request/result types are the driver-free contract in dbcore/mongo.
type (
	CollectionInfo        = db.CollectionInfo
	FindDocumentsInput    = db.FindDocumentsInput
	DocumentResult        = db.DocumentResult
	CountDocumentsInput   = db.CountDocumentsInput
	CountResult           = db.CountResult
	AggregateInput        = db.AggregateInput
	BoundedFindInput      = db.BoundedFindInput
	BoundedAggregateInput = db.BoundedAggregateInput
	BoundedResult         = db.BoundedResult
	IndexSpec             = db.IndexSpec
	CollectionStats       = db.CollectionStats
)
