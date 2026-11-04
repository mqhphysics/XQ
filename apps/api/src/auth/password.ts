import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64

export interface PasswordDigest {
  algorithm: 'scrypt-v1'
  hash: string
  salt: string
}

export function hashPassword(
  password: string,
  salt = randomBytes(16).toString('hex'),
): PasswordDigest {
  return {
    algorithm: 'scrypt-v1',
    hash: scryptSync(password, salt, KEY_LENGTH).toString('hex'),
    salt,
  }
}

export function verifyPassword(password: string, expectedHash: string, salt: string): boolean {
  const actual = scryptSync(password, salt, KEY_LENGTH)
  const expected = Buffer.from(expectedHash, 'hex')

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
