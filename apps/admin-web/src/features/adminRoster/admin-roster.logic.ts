import type {
  RosterPlayerReview,
  RosterRegistrationDetail,
  RosterRegistrationReview,
  RosterReviewFilter,
} from './types'

export function filterRosterRegistrations(
  registrations: RosterRegistrationReview[],
  query: string,
  filter: RosterReviewFilter,
): RosterRegistrationReview[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')

  return registrations.filter((registration) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      registration.teamName.toLocaleLowerCase('zh-CN').includes(normalizedQuery) ||
      registration.teamCode.toLocaleLowerCase('zh-CN').includes(normalizedQuery)

    if (!matchesQuery) return false

    switch (filter) {
      case 'warnings':
        return hasDataQualityWarning(registration)
      case 'unlocked':
        return registration.rosterStatus !== 'LOCKED'
      case 'locked':
        return registration.rosterStatus === 'LOCKED'
      case 'all':
        return true
    }
  })
}

export function hasDataQualityWarning(registration: RosterRegistrationReview): boolean {
  const normalizedStatus = registration.dataQualityStatus?.trim().toUpperCase() ?? ''
  return (
    registration.warningCodes.length > 0 ||
    (normalizedStatus.length > 0 &&
      normalizedStatus !== 'CLEAN' &&
      normalizedStatus !== 'OK' &&
      normalizedStatus !== 'PASSED')
  )
}

export function mapRosterRegistrationListResponse(payload: unknown): RosterRegistrationReview[] {
  const response = requireRecord(payload, '名单列表响应')
  const items = response.items
  if (!Array.isArray(items)) {
    throw contractError('名单列表响应缺少 items 数组')
  }

  return items.map((item, index) => mapRegistration(item, `items[${index}]`))
}

export function mapRosterRegistrationDetailResponse(payload: unknown): RosterRegistrationDetail {
  const response = requireRecord(payload, '名单详情响应')
  const registration = mapRegistration(response, 'detail')
  const players = response.players
  if (!Array.isArray(players)) {
    throw contractError('名单详情响应缺少 players 数组')
  }

  return {
    ...registration,
    leaderDisplayName: nullableString(response.leaderDisplayName, 'detail.leaderDisplayName'),
    coachDisplayName: nullableString(response.coachDisplayName, 'detail.coachDisplayName'),
    importBatchId: nullableString(response.importBatchId, 'detail.importBatchId'),
    importedAt: nullableString(response.importedAt, 'detail.importedAt'),
    players: players.map((player, index) => mapPlayer(player, `players[${index}]`)),
  }
}

export function getRegistrationStatusLabel(status: string): string {
  return statusLabel(status, {
    DRAFT: '草稿',
    SUBMITTED: '已提交',
    APPROVED: '已批准',
    RETURNED: '已退回',
    WITHDRAWN: '已撤回',
    SUSPENDED: '已暂停',
  })
}

export function getRosterStatusLabel(status: string | null): string {
  if (status === null) return '未提交'
  return statusLabel(status, {
    DRAFT: '草稿',
    SUBMITTED: '已提交',
    RETURNED: '已退回',
    APPROVED: '已审核',
    LOCKED: '已锁定',
    REOPENED: '已重开',
    WITHDRAWN: '已撤回',
  })
}

export function getDataQualityLabel(status: string | null): string {
  if (status === null) return '未检测'
  return statusLabel(status, {
    CLEAN: '正常',
    OK: '正常',
    PASSED: '正常',
    WARNING: '有告警',
    REVIEW_REQUIRED: '待核对',
    ERROR: '有错误',
  })
}

export function getStatusTone(status: string | null): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === null) return 'neutral'
  switch (status.trim().toUpperCase()) {
    case 'APPROVED':
    case 'LOCKED':
    case 'CLEAN':
    case 'OK':
    case 'PASSED':
      return 'success'
    case 'RETURNED':
    case 'REOPENED':
    case 'WARNING':
    case 'REVIEW_REQUIRED':
      return 'warning'
    case 'SUSPENDED':
    case 'WITHDRAWN':
    case 'ERROR':
      return 'danger'
    default:
      return 'neutral'
  }
}

function mapRegistration(payload: unknown, location: string): RosterRegistrationReview {
  const item = requireRecord(payload, location)

  return {
    registrationId: requireString(item.registrationId, `${location}.registrationId`),
    teamId: requireString(item.teamId, `${location}.teamId`),
    teamCode: requireString(item.teamCode, `${location}.teamCode`),
    teamName: requireString(item.teamName, `${location}.teamName`),
    registrationStatus: requireString(item.registrationStatus, `${location}.registrationStatus`),
    rosterStatus: nullableString(item.rosterStatus, `${location}.rosterStatus`),
    rosterSubmissionVersion: nullableNonNegativeInteger(
      item.rosterSubmissionVersion,
      `${location}.rosterSubmissionVersion`,
    ),
    rosterSnapshotVersion: nullableNonNegativeInteger(
      item.rosterSnapshotVersion,
      `${location}.rosterSnapshotVersion`,
    ),
    playerCount: requireNonNegativeInteger(item.playerCount, `${location}.playerCount`),
    dataQualityStatus: nullableString(item.dataQualityStatus, `${location}.dataQualityStatus`),
    warningCodes: requireStringArray(item.warningCodes, `${location}.warningCodes`),
    contactName: nullableString(item.contactName, `${location}.contactName`),
    contactPhoneMasked: nullableString(item.contactPhoneMasked, `${location}.contactPhoneMasked`),
  }
}

function mapPlayer(payload: unknown, location: string): RosterPlayerReview {
  const player = requireRecord(payload, location)
  return {
    id: requireString(player.id, `${location}.id`),
    displayName: requireString(player.displayName, `${location}.displayName`),
    studentIdMasked: nullableString(player.studentIdMasked, `${location}.studentIdMasked`),
    shirtNumber: nullableString(player.shirtNumber, `${location}.shirtNumber`),
  }
}

function statusLabel(status: string, labels: Record<string, string>): string {
  const normalized = status.trim().toUpperCase()
  return labels[normalized] ?? status
}

function requireRecord(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw contractError(`${location}不是对象`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, location: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw contractError(`${location}必须是非空字符串`)
  }
  return value
}

function nullableString(value: unknown, location: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') {
    throw contractError(`${location}必须是字符串或 null`)
  }
  return value
}

function requireStringArray(value: unknown, location: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw contractError(`${location}必须是字符串数组`)
  }
  return [...value]
}

function requireNonNegativeInteger(value: unknown, location: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw contractError(`${location}必须是非负整数`)
  }
  return value
}

function nullableNonNegativeInteger(value: unknown, location: string): number | null {
  if (value === null) return null
  return requireNonNegativeInteger(value, location)
}

function contractError(message: string): Error {
  return new Error(`名单 API 契约错误：${message}。`)
}
