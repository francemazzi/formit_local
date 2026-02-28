import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = "formit-api-keys-salt"; // Static salt, key derivation relies on ENCRYPTION_KEY env var

function getDerivedKey(): Buffer {
  const masterKey = process.env.ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for API key encryption. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return scryptSync(masterKey, SALT, 32);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing IV + authTag + ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Concatenate: IV (16) + authTag (16) + ciphertext
  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString("base64");
}

/**
 * Decrypts a base64-encoded string produced by encrypt().
 * Returns the original plaintext.
 */
export function decrypt(encryptedBase64: string): string {
  const key = getDerivedKey();
  const data = Buffer.from(encryptedBase64, "base64");

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Encrypts a value if non-null, returns null otherwise.
 */
export function encryptOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return encrypt(value);
}

/**
 * Decrypts a value if non-null, returns null otherwise.
 * If decryption fails (e.g. plaintext legacy data), returns the original value.
 */
export function decryptOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    // Fallback: value might be stored in plaintext (legacy data before encryption was added)
    return value;
  }
}
