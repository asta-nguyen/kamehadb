package mcp

import (
	"testing"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// mongoCommandMarshalRuns is high enough that a random key order shows up
// almost surely: a two-key Go map puts the command name second about half the
// time, and a three-key map about two thirds of the time.
const mongoCommandMarshalRuns = 300

func firstBSONKey(t *testing.T, command any) string {
	t.Helper()
	raw, err := bson.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}
	elements, err := bson.Raw(raw).Elements()
	if err != nil || len(elements) == 0 {
		t.Fatalf("bad command document: %v", err)
	}
	return elements[0].Key()
}

// MongoDB reads the first field of a command document as the command name. A Go
// map marshals its keys in random order, so createUser intermittently arrived
// as "pwd" or "roles": the command failed, the cleanup dropUser then reported
// UserNotFound, and the account was flagged as needing manual recovery.
func TestMongoManagedAccountCommandsNameTheCommandFirst(t *testing.T) {
	for i := 0; i < mongoCommandMarshalRuns; i++ {
		if got := firstBSONKey(t, mongoCreateUserCommand("kdbmcp_u", "secret", "appdb")); got != "createUser" {
			t.Fatalf("run %d: createUser command starts with %q", i, got)
		}
		if got := firstBSONKey(t, mongoConnectionStatusCommand()); got != "connectionStatus" {
			t.Fatalf("run %d: connectionStatus command starts with %q", i, got)
		}
	}
}

// The role grant must stay exactly one read role on the selected database.
func TestMongoCreateUserCommandGrantsOnlyReadOnTheDatabase(t *testing.T) {
	raw, err := bson.Marshal(mongoCreateUserCommand("kdbmcp_u", "secret", "appdb"))
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		CreateUser string `bson:"createUser"`
		Pwd        string `bson:"pwd"`
		Roles      []struct {
			Role string `bson:"role"`
			DB   string `bson:"db"`
		} `bson:"roles"`
	}
	if err := bson.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.CreateUser != "kdbmcp_u" || decoded.Pwd != "secret" || len(decoded.Roles) != 1 || decoded.Roles[0].Role != "read" || decoded.Roles[0].DB != "appdb" {
		t.Fatalf("unexpected command: %+v", decoded)
	}
}
