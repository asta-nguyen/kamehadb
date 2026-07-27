## ADDED Requirements

### Requirement: Redis key scanning

The system SHALL scan Redis keys with pattern matching (glob-style), cursor-based pagination, and configurable count per scan iteration.

#### Scenario: Scan keys with pattern

- **WHEN** user provides a glob pattern for key scanning
- **THEN** the system returns matching keys with their type, TTL, and size bytes

#### Scenario: Paginate scan results

- **WHEN** user requests the next page of scan results
- **THEN** the system continues scanning from the previous cursor and returns the next batch

### Requirement: Redis value lookup

The system SHALL retrieve and display the value of a Redis key, decoding it based on its type (string, hash, list, set, zset, stream).

#### Scenario: Get string value

- **WHEN** user selects a key of type string
- **THEN** the system displays the string value

#### Scenario: Get hash value

- **WHEN** user selects a key of type hash
- **THEN** the system displays the hash fields and values

#### Scenario: Get list value

- **WHEN** user selects a key of type list
- **THEN** the system displays the list elements

### Requirement: Redis TTL lookup

The system SHALL retrieve the TTL of a specific key in seconds.

#### Scenario: Key with TTL

- **WHEN** user requests TTL for a key with an expiration
- **THEN** the system returns the remaining TTL in seconds

#### Scenario: Key without expiration

- **WHEN** user requests TTL for a key without expiration
- **THEN** the system returns -1 indicating no expiration

### Requirement: Redis command runner

The system SHALL allow executing arbitrary Redis commands and return the result with execution duration.

#### Scenario: Execute command

- **WHEN** user types and runs a Redis command
- **THEN** the system executes it and returns the result with duration in milliseconds

### Requirement: Redis server stats

The system SHALL retrieve Redis server statistics including version, connected clients, blocked clients, total connections, total commands, used memory, used memory peak, max memory, total keys, expiring keys, average TTL, uptime, and hit rate.

#### Scenario: View Redis stats

- **WHEN** user opens the Redis stats view
- **THEN** the system displays all available server statistics
