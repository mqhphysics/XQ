import { createHash, createHmac } from 'node:crypto'

import { ERROR_CODES, type ErrorCode } from '@xiaoqiu/contracts'

const SOURCE_WARNING_CODE = 'SOURCE_WARNING'

export type PlayerIdentityKind = 'STUDENT_ID' | 'EXTERNAL_SOURCE_ID' | 'STABLE_KEY'

export interface ParsedRegistrationPlayer {
  displayName: string
  shirtNumber: string | null
  identityKind: PlayerIdentityKind
  identityValue: string
  studentIdMasked: string | null
}

export interface ParsedRegistrationDocumentV1 {
  schemaVersion: 1
  team: {
    teamCode: string
    name: string
    shortName: string | null
    leaderDisplayName: string | null
    coachDisplayName: string | null
    contactName: string | null
    contactPhone: string | null
  }
  players: ParsedRegistrationPlayer[]
  warningCodes: string[]
}

export interface PlayerIdentity {
  sourceType: string
  sourceKey: string
}

export class RegistrationImportError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly issueCodes: string[] = [],
  ) {
    super(code)
    this.name = 'RegistrationImportError'
  }
}

export function parseRegistrationImportDocument(input: unknown): ParsedRegistrationDocumentV1 {
  const issueCodes: string[] = []
  const warningCodes: string[] = []
  const root = asObject(input)

  if (root === null || root.schemaVersion !== 1) {
    throw invalid(['SCHEMA_VERSION_UNSUPPORTED'])
  }

  const team = asObject(root.team)

  if (team === null) {
    throw invalid(['TEAM_REQUIRED'])
  }

  const contact = asObject(team.contact)
  const teamCode = readString(team, ['teamCode', 'code'])
  const teamName = readString(team, ['name', 'teamName'])

  if (teamCode === null) {
    issueCodes.push('TEAM_CODE_REQUIRED')
  }

  if (teamName === null) {
    issueCodes.push('TEAM_NAME_REQUIRED')
  }

  const rawPlayers = Array.isArray(root.players) ? root.players : null

  if (rawPlayers === null || rawPlayers.length === 0) {
    issueCodes.push('PLAYERS_REQUIRED')
  }

  collectSourceIssues(root.warnings, warningCodes, issueCodes)
  collectSourceIssues(root.issues, warningCodes, issueCodes)
  collectWarningCodes(root.warningCodes, warningCodes)

  const players = (rawPlayers ?? []).flatMap((value, index) => {
    const player = asObject(value)

    if (player === null) {
      issueCodes.push(`PLAYER_${index + 1}_INVALID`)
      return []
    }

    const displayName = readString(player, ['displayName', 'name'])
    const studentId = readString(player, ['studentId', 'studentNumber'])
    const externalSourceId = readString(player, ['externalSourceId', 'externalId'])
    const stableKey = readString(player, ['stableKey'])
    const identity = selectIdentity(studentId, externalSourceId, stableKey)
    const shirtNumber = readShirtNumber(player, warningCodes)

    if (displayName === null) {
      issueCodes.push(`PLAYER_${index + 1}_DISPLAY_NAME_REQUIRED`)
    }

    if (identity === null) {
      issueCodes.push(`PLAYER_${index + 1}_STABLE_ID_REQUIRED`)
    }

    if (displayName === null || identity === null) {
      return []
    }

    return [
      {
        displayName,
        shirtNumber,
        identityKind: identity.kind,
        identityValue: identity.value,
        studentIdMasked: studentId === null ? null : maskStudentId(studentId),
      },
    ]
  })

  const identityKeys = players.map(
    (player) => `${player.identityKind}:${normalizeIdentity(player.identityValue)}`,
  )

  if (new Set(identityKeys).size !== identityKeys.length) {
    issueCodes.push('DUPLICATE_PLAYER_STABLE_ID')
  }

  addDuplicateWarnings(
    players.map((player) => player.displayName),
    'DUPLICATE_DISPLAY_NAME',
    warningCodes,
  )
  addDuplicateWarnings(
    players.flatMap((player) => (player.shirtNumber === null ? [] : [player.shirtNumber])),
    'DUPLICATE_SHIRT_NUMBER',
    warningCodes,
  )

  if (issueCodes.length > 0) {
    throw invalid(issueCodes)
  }

  if (teamCode === null || teamName === null) {
    throw invalid(['TEAM_INVALID'])
  }

  return {
    schemaVersion: 1,
    team: {
      teamCode,
      name: teamName,
      shortName: readString(team, ['shortName']),
      leaderDisplayName: readString(team, ['leaderDisplayName', 'leaderName']),
      coachDisplayName: readString(team, ['coachDisplayName', 'coachName']),
      contactName: readString(team, ['contactName']) ?? readString(contact, ['name']),
      contactPhone: readString(team, ['contactPhone']) ?? readString(contact, ['phone']),
    },
    players,
    warningCodes: [...new Set(warningCodes)].sort(),
  }
}

export function createPlayerIdentity(
  organizationId: string,
  player: ParsedRegistrationPlayer,
  matchingSecret: string,
): PlayerIdentity {
  if (matchingSecret.trim().length < 16) {
    throw new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_INVALID, [
      'MATCHING_SECRET_TOO_SHORT',
    ])
  }

  const sourceType =
    player.identityKind === 'STUDENT_ID'
      ? 'STUDENT_ID_HMAC_SHA256_V1'
      : player.identityKind === 'EXTERNAL_SOURCE_ID'
        ? 'EXTERNAL_SOURCE_HMAC_SHA256_V1'
        : 'REGISTRATION_STABLE_KEY_HMAC_SHA256_V1'
  const sourceKey = createHmac('sha256', matchingSecret)
    .update(organizationId)
    .update('\0')
    .update(sourceType)
    .update('\0')
    .update(normalizeIdentity(player.identityValue))
    .digest('hex')

  return { sourceType, sourceKey }
}

export function hashRegistrationSource(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex')
}

export function maskStudentId(value: string): string {
  const normalized = normalizeIdentity(value)

  if (normalized.length <= 4) {
    return '*'.repeat(normalized.length)
  }

  return `${normalized.slice(0, 2)}${'*'.repeat(Math.min(8, normalized.length - 4))}${normalized.slice(-2)}`
}

function selectIdentity(
  studentId: string | null,
  externalSourceId: string | null,
  stableKey: string | null,
): { kind: PlayerIdentityKind; value: string } | null {
  if (studentId !== null) {
    return { kind: 'STUDENT_ID', value: studentId }
  }

  if (externalSourceId !== null) {
    return { kind: 'EXTERNAL_SOURCE_ID', value: externalSourceId }
  }

  if (stableKey !== null) {
    return { kind: 'STABLE_KEY', value: stableKey }
  }

  return null
}

function readShirtNumber(source: Record<string, unknown>, warningCodes: string[]): string | null {
  const value = source.shirtNumber ?? source.jerseyNumber

  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value === 'string') {
    return value.trim() || null
  }

  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    warningCodes.push('SHIRT_NUMBER_COERCED_TO_STRING')
    return String(value)
  }

  throw invalid(['SHIRT_NUMBER_INVALID'])
}

function collectSourceIssues(value: unknown, warningCodes: string[], issueCodes: string[]): void {
  if (!Array.isArray(value)) {
    return
  }

  for (const issue of value) {
    if (typeof issue === 'string') {
      warningCodes.push(normalizeIssueCode(issue))
      continue
    }

    const item = asObject(issue)

    if (item === null) {
      warningCodes.push(SOURCE_WARNING_CODE)
      continue
    }

    const code = normalizeIssueCode(typeof item.code === 'string' ? item.code : SOURCE_WARNING_CODE)
    const severity = typeof item.severity === 'string' ? item.severity.toUpperCase() : 'WARNING'

    if (severity === 'ERROR') {
      issueCodes.push(code)
    } else {
      warningCodes.push(code)
    }
  }
}

function collectWarningCodes(value: unknown, warningCodes: string[]): void {
  if (!Array.isArray(value)) {
    return
  }

  for (const code of value) {
    warningCodes.push(normalizeIssueCode(typeof code === 'string' ? code : SOURCE_WARNING_CODE))
  }
}

function addDuplicateWarnings(values: string[], code: string, warningCodes: string[]): void {
  if (new Set(values).size !== values.length) {
    warningCodes.push(code)
  }
}

function normalizeIssueCode(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]+/g, '_')
  return normalized.slice(0, 80) || SOURCE_WARNING_CODE
}

function normalizeIdentity(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase()
}

function readString(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (source === null) {
    return null
  }

  for (const key of keys) {
    const value = source[key]

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim()
    }
  }

  return null
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function invalid(issueCodes: string[]): RegistrationImportError {
  return new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_INVALID, [
    ...new Set(issueCodes),
  ])
}
