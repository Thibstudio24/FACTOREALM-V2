import crypto from 'node:crypto';

/**
 * Hachage de mot de passe via Node crypto.scryptSync (N=16384, r=8, p=1) + sel 16 octets.
 */
export function hashPassword(password: string): string {
  if (password.length < 10) {
    throw new Error('Le mot de passe doit contenir au moins 10 caractères.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * Génération d'une clé de récupération propre à l'entreprise (aucune copie centrale).
 */
export function generateCompanyRecoveryKey(): { plaintextKey: string; keyHash: string } {
  const bytes = crypto.randomBytes(24).toString('hex').toUpperCase();
  const groups = bytes.match(/.{1,6}/g) ?? [bytes];
  const plaintextKey = `FRK-${groups.join('-')}`;
  const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');
  return { plaintextKey, keyHash };
}

export function verifyRecoveryKey(candidate: string, expectedSha256Hex: string): boolean {
  const normalized = candidate.trim().toUpperCase();
  const actual = crypto.createHash('sha256').update(normalized).digest();
  const expected = Buffer.from(expectedSha256Hex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Secret TOTP Base32 invalide.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function computeTotpCode(secretBase32: string, timestampMs = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter), 0);
  const key = decodeBase32(secretBase32);
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000;
  return String(code).padStart(6, '0');
}

export function verifyTotpCode(secretBase32: string, candidateCode: string, nowMs = Date.now()): boolean {
  const cleaned = candidateCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  for (const step of [-1, 0, 1]) {
    const expected = computeTotpCode(secretBase32, nowMs + step * 30_000);
    if (crypto.timingSafeEqual(Buffer.from(cleaned), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

/**
 * Chiffrement authentifié AES-256-GCM pour sauvegardes et exports chiffrés (.frbak).
 * Enveloppe JSON : { format: 'FRBAK1', kdf: 'scrypt', saltHex, ivHex, authTagHex, ciphertextB64 }
 */
export interface EncryptedEnvelope {
  format: 'FRBAK1';
  kdf: 'scrypt';
  saltHex: string;
  ivHex: string;
  authTagHex: string;
  ciphertextB64: string;
}

export function encryptBufferWithPassphrase(plain: Buffer, passphrase: string): EncryptedEnvelope {
  if (passphrase.length < 10) {
    throw new Error('La phrase de chiffrement doit contenir au moins 10 caractères.');
  }
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('FACTOREALM-FRBAK1', 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    format: 'FRBAK1',
    kdf: 'scrypt',
    saltHex: salt.toString('hex'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextB64: encrypted.toString('base64'),
  };
}

export function decryptBufferWithPassphrase(
  envelope: EncryptedEnvelope,
  passphrase: string,
): Buffer {
  if (envelope.format !== 'FRBAK1' || envelope.kdf !== 'scrypt') {
    throw new Error('Format de sauvegarde chiffrée non reconnu.');
  }
  const salt = Buffer.from(envelope.saltHex, 'hex');
  const iv = Buffer.from(envelope.ivHex, 'hex');
  const authTag = Buffer.from(envelope.authTagHex, 'hex');
  const ciphertext = Buffer.from(envelope.ciphertextB64, 'base64');
  const key = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from('FACTOREALM-FRBAK1', 'utf8'));
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
