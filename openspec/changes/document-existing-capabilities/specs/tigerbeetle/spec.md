## ADDED Requirements

### Requirement: TigerBeetle account listing

The system SHALL list TigerBeetle accounts with all fields including ID, debits/credits pending and posted, user data fields, reserved, ledger, code, flags, and timestamp.

#### Scenario: List accounts

- **WHEN** user connects to TigerBeetle and opens the explorer
- **THEN** the system displays all accounts with their full metadata

### Requirement: TigerBeetle account creation

The system SHALL create new TigerBeetle accounts with required fields (ID, ledger, code) and optional fields (flags, user data fields, reserved).

#### Scenario: Create account

- **WHEN** user submits a new account with valid fields
- **THEN** the system creates the account and returns the creation result with index and status

### Requirement: TigerBeetle balance lookup

The system SHALL retrieve account balances showing debits pending, debits posted, credits pending, credits posted, and timestamp.

#### Scenario: View account balance

- **WHEN** user selects an account and views its balance
- **THEN** the system displays the current balance fields

### Requirement: TigerBeetle transfer listing

The system SHALL list TigerBeetle transfers with all fields including ID, debit account ID, credit account ID, amount, pending ID, user data fields, timeout, ledger, code, flags, and timestamp.

#### Scenario: List transfers

- **WHEN** user opens the transfers view
- **THEN** the system displays all transfers with their full metadata

### Requirement: TigerBeetle transfer creation

The system SHALL create new TigerBeetle transfers with required fields (ID, debit account ID, credit account ID, amount, ledger, code) and optional fields (flags, pending ID, user data fields, timeout).

#### Scenario: Create transfer

- **WHEN** user submits a new transfer with valid fields
- **THEN** the system creates the transfer and returns the creation result with index and status

### Requirement: TigerBeetle stats

The system SHALL display TigerBeetle statistics including account count and transfer count.

#### Scenario: View stats

- **WHEN** user opens the TigerBeetle stats view
- **THEN** the system displays aggregate counts for accounts and transfers
