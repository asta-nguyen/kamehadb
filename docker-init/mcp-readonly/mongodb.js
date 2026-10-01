// Manual read-only helper for MCP testing. This file lives OUTSIDE the
// docker-entrypoint-initdb.d mounts on purpose: the repo's default Mongo service
// runs without authentication, so a read-only user would not be enforced there.
//
// Run it by hand against an auth-enabled test instance, for example:
//   mongosh "mongodb://root:<password>@localhost:27017/?authSource=admin" \
//     docker-init/mcp-readonly/mongodb.js
//
// The user grants read-only access and no write privileges.

const targetDatabase = 'kamehadb';

db = db.getSiblingDB(targetDatabase);
db.createUser({
  user: 'kameha_mcp_ro',
  pwd: 'kameha_ro',
  roles: [{ role: 'read', db: targetDatabase }],
});
