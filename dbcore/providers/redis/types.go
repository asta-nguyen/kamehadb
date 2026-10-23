package redis

import db "github.com/asta-nguyen/kamehadb/dbcore/redis"

// Request/result types are the driver-free contract in dbcore/redis.
type (
	KeyEntry            = db.KeyEntry
	KeyPage             = db.KeyPage
	RedisValue          = db.RedisValue
	ScanKeysInput       = db.ScanKeysInput
	RedisValuePageInput = db.RedisValuePageInput
	RedisValuePage      = db.RedisValuePage
	RedisCommandRequest = db.RedisCommandRequest
	RedisKeyRequest     = db.RedisKeyRequest
	RedisStats          = db.RedisStats
	CommandResult       = db.CommandResult
)
