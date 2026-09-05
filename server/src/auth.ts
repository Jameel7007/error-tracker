import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16384
const KEY_LEN = 64

const derive = (password: string, salt: Buffer, n: number): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(password, salt, KEY_LEN, { N: n }, (err, key) => (err ? reject(err) : resolve(key))))

/** scrypt with a per-password random salt; the cost is stored so it can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, SCRYPT_N)
  return `scrypt:${SCRYPT_N}:${salt.toString('base64url')}:${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, nStr, saltB64, keyB64] = stored.split(':')
  if (scheme !== 'scrypt' || !nStr || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64url')
  const actual = await derive(password, Buffer.from(saltB64, 'base64url'), Number(nStr))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Opaque bearer token handed to the client. Only its hash is stored. */
export const newToken = (): string => randomBytes(32).toString('base64url')

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export const newId = (): string => randomBytes(16).toString('hex')
