package mcp

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"github.com/asta-nguyen/kamehadb/dbcore/engines"
	mysqladapter "github.com/asta-nguyen/kamehadb/dbcore/providers/mysql"
	pgadapter "github.com/asta-nguyen/kamehadb/dbcore/providers/postgres"
	mssqladapter "github.com/asta-nguyen/kamehadb/dbcore/providers/sqlserver"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

const (
	sqlServerSystemDatabase = "master"
	postgresSystemPrefix    = "pg_"
	mongoUnauthorizedCode   = 13
	mongoUserNotFoundCode   = 11
)

var provisionTimeout = time.Duration(QueryTimeoutMs) * time.Millisecond

// sqlProfileFor gives every MCP SQL connection the saved transport settings along with its selected credentials.
func sqlProfileFor(profile *store.Profile, database, username, password string) engines.ConnProfile {
	cp := engines.ConnProfile{
		Kind: profile.Kind, Database: database,
		Username: username, Password: password, HasPassword: true, SSL: profile.SSL,
	}
	if profile.Host != nil {
		cp.Host = *profile.Host
	}
	if profile.Port != nil {
		cp.Port = *profile.Port
	}
	if profile.SSLCACert != nil {
		cp.SSLCACert = *profile.SSLCACert
	}
	return cp
}

func adminSQLProfile(profile *store.Profile, adminPassword string) (engines.ConnProfile, error) {
	database, err := requireDatabase(profile)
	if err != nil {
		return engines.ConnProfile{}, err
	}
	host := ""
	if profile.Host != nil {
		host = *profile.Host
	}
	username := ""
	if profile.Username != nil {
		username = *profile.Username
	}
	if host == "" || username == "" {
		return engines.ConnProfile{}, opError("Saved database administrator credentials are incomplete")
	}
	return sqlProfileFor(profile, database, username, adminPassword), nil
}

func requireSQLCredential(profile *store.Profile, credential *store.MCPCredentialBundle) (*store.MCPCredentialBundle, error) {
	if credential == nil || credential.Kind != profile.Kind || credential.Kind == engines.KindMongoDB {
		return nil, opError("Generated account does not match the selected database")
	}
	return credential, nil
}

func mongoCredentialMatches(profile *store.Profile, credential *store.MCPCredentialBundle) (*store.MCPCredentialBundle, error) {
	if credential == nil || profile.Kind != engines.KindMongoDB || credential.Kind != engines.KindMongoDB {
		return nil, opError("Generated account does not match the selected database")
	}
	return credential, nil
}

// ---------- PostgreSQL ----------

func verifyPostgresAccount(ctx context.Context, profile *store.Profile, credential *store.MCPCredentialBundle) error {
	cp, err := adminSQLProfile(profile, credential.Password)
	if err != nil {
		return err
	}
	cp.Username, cp.Password = credential.Username, credential.Password
	conn, err := pgadapter.NewNotifyConn(ctx, cp)
	if err != nil {
		return opError("Generated PostgreSQL account could not be verified")
	}
	defer conn.Close(context.Background())

	var username string
	var canCreate bool
	if err := conn.QueryRow(ctx,
		`SELECT current_user AS username, has_database_privilege(current_user, current_database(), 'CREATE') AS can_create`,
	).Scan(&username, &canCreate); err != nil {
		return opError("Generated PostgreSQL account could not be verified")
	}
	rows, err := conn.Query(ctx,
		`SELECT nspname FROM pg_namespace WHERE has_schema_privilege(current_user, oid, 'CREATE')`)
	if err != nil {
		return opError("Generated PostgreSQL account could not be verified")
	}
	var writable []string
	for rows.Next() {
		var nsp string
		if err := rows.Scan(&nsp); err != nil {
			rows.Close()
			return opError("Generated PostgreSQL account could not be verified")
		}
		writable = append(writable, nsp)
	}
	rows.Close()
	if username != credential.Username || canCreate || len(writable) > 1 || (len(writable) == 1 && writable[0] != "information_schema") {
		return opError("PostgreSQL did not grant an effective read-only account")
	}
	return nil
}

func revokePostgresGrants(ctx context.Context, conn *pgx.Conn, database, username string) error {
	dbIdent := engines.QuoteIdentifier(engines.KindPostgres, database)
	role := engines.QuoteIdentifier(engines.KindPostgres, username)
	if _, err := conn.Exec(ctx, fmt.Sprintf(`REVOKE CONNECT ON DATABASE %s FROM %s`, dbIdent, role)); err != nil {
		return err
	}
	rows, err := conn.Query(ctx,
		`SELECT nspname FROM pg_namespace WHERE nspname <> 'information_schema' AND nspname NOT LIKE $1`,
		postgresSystemPrefix+"%")
	if err != nil {
		return err
	}
	var schemas []string
	for rows.Next() {
		var nsp string
		if err := rows.Scan(&nsp); err != nil {
			rows.Close()
			return err
		}
		schemas = append(schemas, nsp)
	}
	rows.Close()
	for _, nsp := range schemas {
		schema := engines.QuoteIdentifier(engines.KindPostgres, nsp)
		for _, stmt := range []string{
			fmt.Sprintf(`REVOKE USAGE ON SCHEMA %s FROM %s`, schema, role),
			fmt.Sprintf(`REVOKE SELECT ON ALL TABLES IN SCHEMA %s FROM %s`, schema, role),
			fmt.Sprintf(`ALTER DEFAULT PRIVILEGES IN SCHEMA %s REVOKE SELECT ON TABLES FROM %s`, schema, role),
		} {
			if _, err := conn.Exec(ctx, stmt); err != nil {
				return err
			}
		}
	}
	return nil
}

func provisionPostgres(ctx context.Context, profile *store.Profile, adminPassword string, credential *store.MCPCredentialBundle, beforeFirstWrite func() error) error {
	cp, err := adminSQLProfile(profile, adminPassword)
	if err != nil {
		return err
	}
	conn, err := pgadapter.NewNotifyConn(ctx, cp)
	if err != nil {
		return opError("PostgreSQL could not create and verify the read-only account")
	}
	defer conn.Close(context.Background())

	created := false
	fail := func() error {
		if created {
			var exists bool
			if qerr := conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1)`, credential.Username).Scan(&exists); qerr == nil && exists {
				if rerr := revokePostgresGrants(ctx, conn, cp.Database, credential.Username); rerr == nil {
					if _, derr := conn.Exec(ctx, `DROP ROLE `+engines.QuoteIdentifier(engines.KindPostgres, credential.Username)); derr == nil {
						goto done
					}
				}
				return &AccountOperationError{Message: "PostgreSQL setup failed and the partial account could not be removed", CleanupFailed: true}
			}
		}
	done:
		return opError("PostgreSQL could not create and verify the read-only account")
	}

	var exists bool
	if err := conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1)`, credential.Username).Scan(&exists); err != nil {
		return fail()
	}
	if exists {
		return opError("Generated PostgreSQL account name is already in use")
	}
	if err := beforeFirstWrite(); err != nil {
		return err
	}
	created = true
	role := engines.QuoteIdentifier(engines.KindPostgres, credential.Username)
	passwordLit := "'" + strings.ReplaceAll(credential.Password, "'", "''") + "'"
	if _, err := conn.Exec(ctx, fmt.Sprintf(`CREATE ROLE %s LOGIN PASSWORD %s`, role, passwordLit)); err != nil {
		return fail()
	}
	if _, err := conn.Exec(ctx, fmt.Sprintf(`GRANT CONNECT ON DATABASE %s TO %s`,
		engines.QuoteIdentifier(engines.KindPostgres, cp.Database), role)); err != nil {
		return fail()
	}
	rows, err := conn.Query(ctx,
		`SELECT nspname FROM pg_namespace WHERE nspname <> 'information_schema' AND nspname NOT LIKE $1`,
		postgresSystemPrefix+"%")
	if err != nil {
		return fail()
	}
	var schemas []string
	for rows.Next() {
		var nsp string
		if err := rows.Scan(&nsp); err != nil {
			rows.Close()
			return fail()
		}
		schemas = append(schemas, nsp)
	}
	rows.Close()
	for _, nsp := range schemas {
		schema := engines.QuoteIdentifier(engines.KindPostgres, nsp)
		for _, stmt := range []string{
			fmt.Sprintf(`GRANT USAGE ON SCHEMA %s TO %s`, schema, role),
			fmt.Sprintf(`GRANT SELECT ON ALL TABLES IN SCHEMA %s TO %s`, schema, role),
			fmt.Sprintf(`ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT SELECT ON TABLES TO %s`, schema, role),
		} {
			if _, err := conn.Exec(ctx, stmt); err != nil {
				return fail()
			}
		}
	}
	if err := verifyPostgresAccount(ctx, profile, credential); err != nil {
		return fail()
	}
	return nil
}

func revokePostgres(ctx context.Context, profile *store.Profile, adminPassword, username string) error {
	cp, err := adminSQLProfile(profile, adminPassword)
	if err != nil {
		return err
	}
	conn, err := pgadapter.NewNotifyConn(ctx, cp)
	if err != nil {
		return &AccountOperationError{Message: "PostgreSQL managed account could not be revoked"}
	}
	defer conn.Close(context.Background())
	var exists bool
	if err := conn.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = $1)`, username).Scan(&exists); err != nil {
		return pgRevokeError(err)
	}
	if !exists {
		return nil
	}
	if err := revokePostgresGrants(ctx, conn, cp.Database, username); err != nil {
		return pgRevokeError(err)
	}
	if _, err := conn.Exec(ctx, `DROP ROLE `+engines.QuoteIdentifier(engines.KindPostgres, username)); err != nil {
		return pgRevokeError(err)
	}
	return nil
}

var pgCodeRe = regexp.MustCompile(`^[A-Z0-9]{5}$`)

func pgRevokeError(err error) error {
	op := &AccountOperationError{Message: "PostgreSQL managed account could not be revoked"}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgCodeRe.MatchString(pgErr.Code) {
		op.DatabaseCode = pgErr.Code
	}
	return op
}

// ---------- MySQL / MariaDB ----------

func mysqlAdminDB(profile *store.Profile, adminPassword string) (*sql.DB, error) {
	database, err := requireDatabase(profile)
	if err != nil {
		return nil, err
	}
	host := ""
	if profile.Host != nil {
		host = *profile.Host
	}
	username := ""
	if profile.Username != nil {
		username = *profile.Username
	}
	if host == "" || username == "" {
		return nil, opError("Saved database administrator credentials are incomplete")
	}
	cp := sqlProfileFor(profile, database, username, adminPassword)
	return mysqladapter.OpenDB(cp)
}

func mysqlAccount(username string) string {
	lit := "'" + strings.ReplaceAll(username, "'", "''") + "'"
	return lit + "@'" + mysqlAccountHost + "'"
}

func mysqlQuoteLit(v string) string { return "'" + strings.ReplaceAll(v, "'", "''") + "'" }

func verifyMysqlAccount(ctx context.Context, profile *store.Profile, credential *store.MCPCredentialBundle) error {
	database, err := requireDatabase(profile)
	if err != nil {
		return err
	}
	cp := sqlProfileFor(profile, database, credential.Username, credential.Password)
	db, err := mysqladapter.OpenDB(cp)
	if err != nil {
		return opError("Generated MySQL account could not be verified")
	}
	defer db.Close()

	rows, err := db.QueryContext(ctx, "SHOW GRANTS FOR CURRENT_USER")
	if err != nil {
		return opError("Generated MySQL account could not be verified")
	}
	defer rows.Close()
	var grants []string
	for rows.Next() {
		var g string
		if err := rows.Scan(&g); err != nil {
			return opError("Generated MySQL account could not be verified")
		}
		grants = append(grants, strings.ToUpper(g))
	}
	allowedDB := strings.ToUpper("ON `" + strings.ReplaceAll(database, "`", "``") + "`.*")
	hasDBSelect := false
	hasWrite := false
	hasOtherSelect := false
	for _, g := range grants {
		if strings.Contains(g, "GRANT ") && !strings.Contains(g, "GRANT USAGE ") && !strings.Contains(g, "GRANT SELECT ") {
			hasWrite = true
		}
		if strings.Contains(g, "GRANT SELECT ") {
			if strings.Contains(g, allowedDB) {
				hasDBSelect = true
			} else {
				hasOtherSelect = true
			}
		}
	}
	if !hasDBSelect || hasWrite || hasOtherSelect {
		return opError("MySQL did not grant an effective read-only account")
	}
	return nil
}

func provisionMysql(ctx context.Context, profile *store.Profile, adminPassword string, credential *store.MCPCredentialBundle, beforeFirstWrite func() error) error {
	db, err := mysqlAdminDB(profile, adminPassword)
	if err != nil {
		return err
	}
	defer db.Close()

	created := false
	fail := func() error {
		if created {
			if _, derr := db.ExecContext(ctx, `DROP USER IF EXISTS `+mysqlAccount(credential.Username)); derr != nil {
				return &AccountOperationError{Message: "MySQL setup failed and the partial account could not be removed", CleanupFailed: true}
			}
		}
		return opError("MySQL could not create and verify the read-only account")
	}

	var exists int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM mysql.user WHERE User = ? AND Host = ?`,
		credential.Username, mysqlAccountHost).Scan(&exists); err != nil {
		return fail()
	}
	if exists > 0 {
		return opError("Generated MySQL account name is already in use")
	}
	if err := beforeFirstWrite(); err != nil {
		return err
	}
	created = true
	if _, err := db.ExecContext(ctx,
		fmt.Sprintf(`CREATE USER %s IDENTIFIED BY %s`, mysqlAccount(credential.Username), mysqlQuoteLit(credential.Password))); err != nil {
		return fail()
	}
	dbIdent := "`" + strings.ReplaceAll(profileDatabase(profile), "`", "``") + "`"
	if _, err := db.ExecContext(ctx,
		fmt.Sprintf(`GRANT SELECT ON %s.* TO %s`, dbIdent, mysqlAccount(credential.Username))); err != nil {
		return fail()
	}
	if err := verifyMysqlAccount(ctx, profile, credential); err != nil {
		return fail()
	}
	return nil
}

func profileDatabase(p *store.Profile) string {
	if p.Database == nil {
		return ""
	}
	return *p.Database
}

func revokeMysql(ctx context.Context, profile *store.Profile, adminPassword, username string) error {
	db, err := mysqlAdminDB(profile, adminPassword)
	if err != nil {
		return err
	}
	defer db.Close()
	if _, err := db.ExecContext(ctx, `DROP USER IF EXISTS `+mysqlAccount(username)); err != nil {
		return opError("MySQL managed account could not be revoked")
	}
	return nil
}

// ---------- SQL Server ----------

func sqlServerAdminDB(profile *store.Profile, adminPassword, database string) (*sql.DB, error) {
	host := ""
	if profile.Host != nil {
		host = *profile.Host
	}
	username := ""
	if profile.Username != nil {
		username = *profile.Username
	}
	if host == "" || username == "" {
		return nil, opError("Saved database administrator credentials are incomplete")
	}
	cp := sqlProfileFor(profile, database, username, adminPassword)
	return mssqladapter.OpenDB(cp, provisionTimeout)
}

func mssqlIdent(v string) string { return "[" + strings.ReplaceAll(v, "]", "]]") + "]" }
func mssqlLit(v string) string   { return "'" + strings.ReplaceAll(v, "'", "''") + "'" }

func verifySqlServerAccount(ctx context.Context, profile *store.Profile, credential *store.MCPCredentialBundle) error {
	database, err := requireDatabase(profile)
	if err != nil {
		return err
	}
	cp := sqlProfileFor(profile, database, credential.Username, credential.Password)
	db, err := mssqladapter.OpenDB(cp, provisionTimeout)
	if err != nil {
		return opError("Generated SQL Server account could not be verified")
	}
	defer db.Close()

	var username string
	var isReader, isWriter, isOwner, canCreateTable, canAlter, canInsert, canUpdate, canDelete int
	err = db.QueryRowContext(ctx, `
		SELECT SUSER_SNAME() AS username,
		  IS_ROLEMEMBER('db_datareader') AS is_reader,
		  IS_ROLEMEMBER('db_datawriter') AS is_writer,
		  IS_ROLEMEMBER('db_owner') AS is_owner,
		  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS can_create_table,
		  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER') AS can_alter_database,
		  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS can_insert,
		  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'UPDATE') AS can_update,
		  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'DELETE') AS can_delete`,
	).Scan(&username, &isReader, &isWriter, &isOwner, &canCreateTable, &canAlter, &canInsert, &canUpdate, &canDelete)
	if err != nil {
		return opError("Generated SQL Server account could not be verified")
	}
	hasWrite := isWriter == 1 || isOwner == 1 || canCreateTable == 1 || canAlter == 1 ||
		canInsert == 1 || canUpdate == 1 || canDelete == 1
	if username != credential.Username || isReader != 1 || hasWrite {
		return opError("SQL Server did not grant an effective read-only account")
	}
	return nil
}

func provisionSqlServer(ctx context.Context, profile *store.Profile, adminPassword string, credential *store.MCPCredentialBundle, beforeFirstWrite func() error) error {
	database, err := requireDatabase(profile)
	if err != nil {
		return err
	}
	masterDB, err := sqlServerAdminDB(profile, adminPassword, sqlServerSystemDatabase)
	if err != nil {
		return err
	}
	defer masterDB.Close()

	createdLogin := false
	createdUser := false
	fail := func() error {
		if createdLogin {
			if createdUser {
				if dbDB, derr := sqlServerAdminDB(profile, adminPassword, database); derr == nil {
					_, _ = dbDB.ExecContext(ctx, `DROP USER IF EXISTS `+mssqlIdent(credential.Username))
					dbDB.Close()
				}
			}
			if _, derr := masterDB.ExecContext(ctx, `DROP LOGIN IF EXISTS `+mssqlIdent(credential.Username)); derr != nil {
				return &AccountOperationError{Message: "SQL Server setup failed and the partial account could not be removed", CleanupFailed: true}
			}
		}
		return opError("SQL Server could not create and verify the read-only account")
	}

	var exists int
	if err := masterDB.QueryRowContext(ctx, `SELECT COUNT(*) FROM sys.server_principals WHERE name = @p1`,
		credential.Username).Scan(&exists); err != nil {
		return fail()
	}
	if exists > 0 {
		return opError("Generated SQL Server account name is already in use")
	}
	if err := beforeFirstWrite(); err != nil {
		return err
	}
	createdLogin = true
	if _, err := masterDB.ExecContext(ctx, fmt.Sprintf(
		`CREATE LOGIN %s WITH PASSWORD = %s, CHECK_POLICY = ON`,
		mssqlIdent(credential.Username), mssqlLit(credential.Password))); err != nil {
		return fail()
	}
	dbDB, err := sqlServerAdminDB(profile, adminPassword, database)
	if err != nil {
		return fail()
	}
	defer dbDB.Close()
	if _, err := dbDB.ExecContext(ctx, fmt.Sprintf(
		`CREATE USER %s FOR LOGIN %s`, mssqlIdent(credential.Username), mssqlIdent(credential.Username))); err != nil {
		return fail()
	}
	createdUser = true
	if _, err := dbDB.ExecContext(ctx, fmt.Sprintf(
		`ALTER ROLE [db_datareader] ADD MEMBER %s`, mssqlIdent(credential.Username))); err != nil {
		return fail()
	}
	if err := verifySqlServerAccount(ctx, profile, credential); err != nil {
		return fail()
	}
	return nil
}

func revokeSqlServer(ctx context.Context, profile *store.Profile, adminPassword, username string) error {
	database, err := requireDatabase(profile)
	if err != nil {
		return err
	}
	dbDB, err := sqlServerAdminDB(profile, adminPassword, database)
	if err != nil {
		return err
	}
	_, execErr := dbDB.ExecContext(ctx, `DROP USER IF EXISTS `+mssqlIdent(username))
	dbDB.Close()
	if execErr != nil {
		return opError("SQL Server managed account could not be revoked")
	}
	masterDB, err := sqlServerAdminDB(profile, adminPassword, sqlServerSystemDatabase)
	if err != nil {
		return opError("SQL Server managed account could not be revoked")
	}
	defer masterDB.Close()
	if _, err := masterDB.ExecContext(ctx, `DROP LOGIN IF EXISTS `+mssqlIdent(username)); err != nil {
		return opError("SQL Server managed account could not be revoked")
	}
	return nil
}

// ---------- MongoDB ----------

func mongoConnect(ctx context.Context, uri string) (*mongo.Client, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(uri).
		SetServerSelectionTimeout(provisionTimeout))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		client.Disconnect(ctx)
		return nil, err
	}
	return client, nil
}

func mongoErrorCode(err error) int {
	var cmdErr mongo.CommandError
	if errors.As(err, &cmdErr) {
		return int(cmdErr.Code)
	}
	var writeErr mongo.WriteException
	if errors.As(err, &writeErr) && len(writeErr.WriteErrors) > 0 {
		return int(writeErr.WriteErrors[0].Code)
	}
	return 0
}

// assertMongoAuthEnabled probes unauthenticated: a listCollections that
// succeeds means access control is off and a managed account is pointless.
func assertMongoAuthEnabled(ctx context.Context, profile *store.Profile) error {
	if profile.ConnectionString == nil || *profile.ConnectionString == "" {
		return opError("MongoDB connection string is required")
	}
	database, err := requireDatabase(profile)
	if err != nil {
		return err
	}
	uri, err := mongoURI(*profile.ConnectionString, nil, "", "")
	if err != nil {
		return err
	}
	client, err := mongoConnect(ctx, uri)
	if err != nil {
		if mongoErrorCode(err) == mongoUnauthorizedCode {
			return nil
		}
		return opError("MongoDB access-control probe was inconclusive; account setup was stopped")
	}
	defer client.Disconnect(ctx)
	res := client.Database(database).RunCommand(ctx, map[string]any{"listCollections": 1})
	if err := res.Err(); err != nil {
		if mongoErrorCode(err) == mongoUnauthorizedCode {
			return nil
		}
		return opError("MongoDB access-control probe was inconclusive; account setup was stopped")
	}
	return opError("MongoDB permits unauthenticated reads; enable access control first")
}

func verifyMongoAccount(ctx context.Context, profile *store.Profile, credential *store.MCPCredentialBundle) error {
	client, err := mongoConnect(ctx, credential.ConnectionString)
	if err != nil {
		return opError("Generated MongoDB account could not be verified")
	}
	defer client.Disconnect(ctx)
	database, err := requireDatabase(profile)
	if err != nil {
		return err
	}
	var status struct {
		AuthInfo struct {
			AuthenticatedUserRoles []struct {
				Role string `bson:"role"`
				DB   string `bson:"db"`
			} `bson:"authenticatedUserRoles"`
		} `bson:"authInfo"`
	}
	if err := client.Database(database).RunCommand(ctx, mongoConnectionStatusCommand()).Decode(&status); err != nil {
		return opError("Generated MongoDB account could not be verified")
	}
	roles := status.AuthInfo.AuthenticatedUserRoles
	if len(roles) != 1 || roles[0].Role != "read" || roles[0].DB != database {
		return opError("MongoDB did not grant the selected database read role")
	}
	if err := client.Database(database).RunCommand(ctx, map[string]any{"listCollections": 1}).Err(); err != nil {
		return opError("Generated MongoDB account could not be verified")
	}
	return nil
}

// MongoDB takes the first field of a command document as the command name. A Go
// map marshals its keys in random order, so multi-field commands are built as
// ordered bson.D documents instead.
func mongoConnectionStatusCommand() bson.D {
	return bson.D{{Key: "connectionStatus", Value: 1}, {Key: "showPrivileges", Value: true}}
}

func mongoCreateUserCommand(username, password, database string) bson.D {
	return bson.D{
		{Key: "createUser", Value: username},
		{Key: "pwd", Value: password},
		{Key: "roles", Value: bson.A{bson.D{{Key: "role", Value: "read"}, {Key: "db", Value: database}}}},
	}
}

func provisionMongo(ctx context.Context, profile *store.Profile, accountRef string, credential *store.MCPCredentialBundle, beforeFirstWrite func() error) error {
	if err := assertMongoAuthEnabled(ctx, profile); err != nil {
		return err
	}
	username, err := generatedUsername(profile.Kind, accountRef)
	if err != nil {
		return err
	}
	generated, err := parseMongoURI(credential.ConnectionString)
	if err != nil || generated.username != username {
		return opError("Generated MongoDB account does not match its saved account reference")
	}
	if profile.ConnectionString == nil || *profile.ConnectionString == "" {
		return opError("MongoDB connection string is required")
	}
	database, err := requireDatabase(profile)
	if err != nil {
		return err
	}
	client, err := mongoConnect(ctx, *profile.ConnectionString)
	if err != nil {
		return opError("MongoDB could not create and verify the read-only account")
	}
	defer client.Disconnect(ctx)

	created := false
	fail := func() error {
		if created {
			if derr := client.Database(database).RunCommand(ctx, map[string]any{"dropUser": username}).Err(); derr != nil {
				return &AccountOperationError{Message: "MongoDB setup failed and the partial account could not be removed", CleanupFailed: true}
			}
		}
		return opError("MongoDB could not create and verify the read-only account")
	}

	var usersInfo struct {
		Users []any `bson:"users"`
	}
	if err := client.Database(database).RunCommand(ctx, map[string]any{"usersInfo": username}).Decode(&usersInfo); err != nil {
		return fail()
	}
	if len(usersInfo.Users) > 0 {
		return opError("Generated MongoDB account name is already in use")
	}
	if err := beforeFirstWrite(); err != nil {
		return err
	}
	created = true
	if err := client.Database(database).RunCommand(ctx, mongoCreateUserCommand(username, generated.password, database)).Err(); err != nil {
		return fail()
	}
	if err := verifyMongoAccount(ctx, profile, credential); err != nil {
		return fail()
	}
	return nil
}

func revokeMongo(ctx context.Context, profile *store.Profile, username string) error {
	if profile.ConnectionString == nil || *profile.ConnectionString == "" {
		return opError("MongoDB connection string is required")
	}
	database, err := requireDatabase(profile)
	if err != nil {
		return err
	}
	client, err := mongoConnect(ctx, *profile.ConnectionString)
	if err != nil {
		return opError("MongoDB managed account could not be revoked")
	}
	defer client.Disconnect(ctx)
	if err := client.Database(database).RunCommand(ctx, map[string]any{"dropUser": username}).Err(); err != nil {
		if mongoErrorCode(err) == mongoUserNotFoundCode {
			return nil
		}
		return opError("MongoDB managed account could not be revoked")
	}
	return nil
}

// ---------- dispatch — provisionMcpAccount / revokeMcpAccount ----------

func ProvisionAccount(ctx context.Context, profile *store.Profile, adminPassword, accountRef string, credential *store.MCPCredentialBundle, beforeFirstWrite func() error) error {
	if profile.Kind == engines.KindMongoDB {
		cred, err := mongoCredentialMatches(profile, credential)
		if err != nil {
			return err
		}
		return provisionMongo(ctx, profile, accountRef, cred, beforeFirstWrite)
	}
	cred, err := requireSQLCredential(profile, credential)
	if err != nil {
		return err
	}
	switch profile.Kind {
	case engines.KindPostgres:
		return provisionPostgres(ctx, profile, adminPassword, cred, beforeFirstWrite)
	case engines.KindMySQL, engines.KindMariaDB:
		return provisionMysql(ctx, profile, adminPassword, cred, beforeFirstWrite)
	case engines.KindSQLServer:
		return provisionSqlServer(ctx, profile, adminPassword, cred, beforeFirstWrite)
	}
	return opError("This database does not use a managed MCP account")
}

func RevokeAccount(ctx context.Context, profile *store.Profile, adminPassword, accountRef string) error {
	username, err := generatedUsername(profile.Kind, accountRef)
	if err != nil {
		return err
	}
	switch profile.Kind {
	case engines.KindPostgres:
		return revokePostgres(ctx, profile, adminPassword, username)
	case engines.KindMySQL, engines.KindMariaDB:
		return revokeMysql(ctx, profile, adminPassword, username)
	case engines.KindSQLServer:
		return revokeSqlServer(ctx, profile, adminPassword, username)
	case engines.KindMongoDB:
		return revokeMongo(ctx, profile, username)
	}
	return opError("This database does not use a managed MCP account")
}
