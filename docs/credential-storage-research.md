# Local credential storage in database clients

## Verified example: Beekeeper Studio

Beekeeper Studio documents that saved connections and queries live in a local SQLite file named `app.db` in the operating system's application data directory on macOS, Windows, and Linux. Its connection screen offers a **Save Passwords** option. [Storage documentation](https://docs.beekeeperstudio.io/support/data-location/), [connection documentation](https://docs.beekeeperstudio.io/user_guide/connecting/connecting/).

The `saved_connection` entity maps `password` to a database column with `EncryptTransformer`; it clears password fields before saving when `rememberPassword` is false. Thus its saved password is **encrypted before insertion into SQLite**, not stored as plaintext in that column. [Connection model](https://github.com/beekeeper-studio/beekeeper-studio/blob/master/apps/studio/src/common/appdb/models/saved_connection.ts).

The encryption key is generated into a `.key` file in the user's application directory. That file is itself encrypted using a default key present in the application's source. This protects against casual inspection of `app.db`, but possession of the application data directory and source can expose the key; it does not provide the same boundary as an OS credential store. [Key loading implementation](https://github.com/beekeeper-studio/beekeeper-studio/blob/master/apps/studio/src/common/encryption_key.ts).

## Contrast: DBeaver

DBeaver documents saved connection definitions in `data-sources.json` and credentials in `credentials-config.json`; that is a local file approach, but **not a SQLite example**. Its documentation warns that the default DES key is public and describes stronger storage options. [Connection file reference](https://dbeaver.com/docs/dbeaver/Data-Sources-Json-Reference/), [project security](https://dbeaver.com/docs/dbeaver/Project-security/).

## Implication for KamehaDB

Using SQLite for saved credentials is an established cross-platform pattern. SQLite is the storage format, not a security boundary. KamehaDB must explicitly choose between plaintext protected by local file permissions, application encryption with a locally stored key, or an OS credential store; Beekeeper Studio demonstrates the middle option, with the limits above.
