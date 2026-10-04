import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { McpManagedCredentialBundleSchema, type McpManagedCredentialBundle } from '@kamehadb/shared';

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const FORMAT_VERSION = 'v1';

// Keep the key outside SQLite so a copy of the database alone does not expose credentials.
// A complete copy of the app data directory still contains everything needed to decrypt them.
function readKey(dbPath: string, allowCreate: boolean): Buffer {
  const keyPath = `${dbPath}.mcp.key`;
  let key: Buffer;
  try {
    key = readFileSync(keyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !allowCreate) {
      throw new Error('Local MCP credential key is unavailable');
    }
    try {
      writeFileSync(keyPath, randomBytes(KEY_BYTES), { flag: 'wx', mode: 0o600, flush: true });
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new Error('Local MCP credential key could not be created');
      }
    }
    key = readFileSync(keyPath);
  }
  if (key.length !== KEY_BYTES) throw new Error('Local MCP credential key is invalid');
  return key;
}

function associatedData(profileId: string, accountRef: string): Buffer {
  return Buffer.from(JSON.stringify([profileId, accountRef]));
}

// Bind each ciphertext to its profile and generated DB principal so moving rows cannot grant access.
export function encryptMcpCredential(
  dbPath: string,
  profileId: string,
  accountRef: string,
  credential: McpManagedCredentialBundle,
  allowCreateKey: boolean,
): string {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', readKey(dbPath, allowCreateKey), nonce);
  cipher.setAAD(associatedData(profileId, accountRef));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credential), 'utf8'), cipher.final()]);
  return [
    FORMAT_VERSION,
    nonce.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

// Authenticate before parsing so corrupted or swapped rows never become an MCP credential.
export function decryptMcpCredential(
  dbPath: string,
  profileId: string,
  accountRef: string,
  stored: string,
): McpManagedCredentialBundle {
  try {
    const [version, noncePart, tagPart, ciphertextPart, extra] = stored.split('.');
    if (version !== FORMAT_VERSION || !noncePart || !tagPart || !ciphertextPart || extra) {
      throw new Error('Invalid credential format');
    }
    const nonce = Buffer.from(noncePart, 'base64url');
    if (nonce.length !== NONCE_BYTES) throw new Error('Invalid credential nonce');
    const decipher = createDecipheriv('aes-256-gcm', readKey(dbPath, false), nonce);
    decipher.setAAD(associatedData(profileId, accountRef));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextPart, 'base64url')), decipher.final()]);
    return McpManagedCredentialBundleSchema.parse(JSON.parse(plaintext.toString('utf8')));
  } catch {
    throw new Error('Stored MCP credential could not be decrypted');
  }
}
