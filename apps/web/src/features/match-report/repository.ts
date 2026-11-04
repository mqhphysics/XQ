import type Taro from '@tarojs/taro'
import { apiRequest } from '../cloud-api/request'

import { readSession } from '../product/session'
import type {
  ReportFields,
  ReportGateway,
  ReportRevision,
  ReportWorkspace,
  SaveReportCommand,
} from './types'

export class MatchReportError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'MatchReportError'
  }
}

// This adapter follows the MatchReportController DTO source; UI events keep local IDs.
export const matchReportGateway: ReportGateway = {
  load: async (matchId) =>
    parseWorkspace(await request(`/matches/${encodeURIComponent(matchId)}/report`)),
  history: async (matchId, beforeVersion) => {
    const data = await request(
      `/matches/${encodeURIComponent(matchId)}/report/history${beforeVersion ? `?beforeVersion=${beforeVersion}` : ''}`,
    )
    if (!isRecord(data) || !Array.isArray(data.items)) throw invalidResponse()
    const items = data.items.map(fromWireRevision)
    if (
      !items.every(isRevision) ||
      !(
        data.nextBeforeVersion === null ||
        (Number.isSafeInteger(data.nextBeforeVersion) && Number(data.nextBeforeVersion) > 0)
      )
    )
      throw invalidResponse()
    return {
      items: (items as ReportRevision[]).sort((a, b) => b.version - a.version),
      nextBeforeVersion: data.nextBeforeVersion as number | null,
    }
  },
  save: async (matchId, command) =>
    parseWorkspace(
      await request(
        `/matches/${encodeURIComponent(matchId)}/report`,
        'POST',
        toWireCommand(command),
      ),
    ),
}

export const inlineReportGateway = {
  ...matchReportGateway,
  begin: async (matchId: string, clientActionId: string) =>
    parseWorkspace(
      await request(`/matches/${encodeURIComponent(matchId)}/report/editor`, 'POST', {
        clientActionId,
      }),
    ),
  requestChange: async (matchId: string, clientActionId: string, reason: string) =>
    parseWorkspace(
      await request(`/matches/${encodeURIComponent(matchId)}/report/change-requests`, 'POST', {
        clientActionId,
        reason,
      }),
    ),
}

async function request(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  data?: unknown,
): Promise<unknown> {
  const session = readSession()
  if (!session || !Number.isFinite(Date.parse(session.expiresAt)))
    throw new MatchReportError('请先登录有效的信息员或管理员账号', 401)
  const configured = process.env.TARO_APP_API_BASE_URL?.trim().replace(/\/+$/, '')
  if (!configured) throw new MatchReportError('比赛报告服务尚未配置，暂时无法录入', 503)
  const base = configured.endsWith('/api') ? configured : `${configured}/api`
  let response: Taro.request.SuccessCallbackResult
  try {
    response = await apiRequest({
      url: `${base}${path}`,
      method,
      data,
      header: {
        'content-type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      timeout: 12000,
    })
  } catch {
    throw new MatchReportError('网络未返回保存结果。请保留当前内容，连接恢复后重试确认。', 0)
  }
  if (readSession()?.accessToken !== session.accessToken)
    throw new MatchReportError('账号已切换，请重新进入比赛报告。原账号的草稿已保留。', 0)
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data
    const message =
      isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
        ? body.error.message
        : isRecord(body) && typeof body.message === 'string'
          ? body.message
          : ''
    const fallback =
      response.statusCode === 404 || response.statusCode === 501
        ? '此比赛的报告接口尚未接入，暂时无法录入或查看历史版本'
        : response.statusCode === 409
          ? '其他工作人员已保存新版本。你的改动已保留，请先核对最新版本。'
          : response.statusCode === 403
            ? '你没有这场比赛的录入权限'
            : `报告请求失败（${response.statusCode}）`
    throw new MatchReportError(message || fallback, response.statusCode)
  }
  return response.data
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
export function isFields(value: unknown): value is ReportFields {
  if (
    !isRecord(value) ||
    typeof value.homeScore !== 'string' ||
    typeof value.awayScore !== 'string' ||
    typeof value.homePenaltyScore !== 'string' ||
    typeof value.awayPenaltyScore !== 'string' ||
    typeof value.notes !== 'string' ||
    !['FINISHED', 'HOME_FORFEIT', 'AWAY_FORFEIT', 'ABANDONED'].includes(String(value.outcome)) ||
    !Array.isArray(value.events)
  )
    return false
  return value.events.every(
    (event) =>
      isRecord(event) &&
      ['id', 'minute', 'addedMinute', 'playerId', 'relatedPlayerId'].every(
        (key) => typeof event[key] === 'string',
      ) &&
      ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION'].includes(
        String(event.kind),
      ) &&
      ['HOME', 'AWAY'].includes(String(event.side)),
  )
}
function isRevision(value: unknown): value is ReportRevision {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.version) &&
    Number(value.version) > 0 &&
    typeof value.savedAt === 'string' &&
    Number.isFinite(Date.parse(value.savedAt)) &&
    typeof value.savedBy === 'string' &&
    typeof value.reason === 'string' &&
    ['homeRosterSnapshotId', 'awayRosterSnapshotId', 'ruleVersionId'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    ['DRAFT', 'SUBMITTED', 'RETURNED', 'CONFIRMED'].includes(String(value.status)) &&
    isFields(value.fields)
  )
}
function parseWorkspace(value: unknown): ReportWorkspace {
  if (isRecord(value) && value.latest !== null)
    value = { ...value, latest: fromWireRevision(value.latest) }
  if (
    !isRecord(value) ||
    !['organizationId', 'matchId', 'title'].every((key) => typeof value[key] === 'string') ||
    !(value.ruleVersionId === null || typeof value.ruleVersionId === 'string') ||
    typeof value.isKnockout !== 'boolean' ||
    !isTeam(value.homeTeam) ||
    !isTeam(value.awayTeam) ||
    !isRecord(value.permissions) ||
    !['canEdit', 'canSubmit', 'canViewHistory', 'canCorrect', 'canConfirm', 'canReturn'].every(
      (key) => typeof (value.permissions as Record<string, unknown>)[key] === 'boolean',
    ) ||
    !(value.latest === null || isRevision(value.latest)) ||
    !(value.reviewNote === null || typeof value.reviewNote === 'string') ||
    !(
      value.blockingReasons === undefined ||
      (Array.isArray(value.blockingReasons) &&
        value.blockingReasons.every((reason) => typeof reason === 'string'))
    )
  )
    throw invalidResponse()
  return value as unknown as ReportWorkspace
}
function isTeam(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.rosterSnapshotId === null || typeof value.rosterSnapshotId === 'string') &&
    Array.isArray(value.players) &&
    value.players.every(
      (player) =>
        isRecord(player) &&
        typeof player.id === 'string' &&
        typeof player.displayName === 'string' &&
        (player.shirtNumber === null || typeof player.shirtNumber === 'string'),
    )
  )
}
function invalidResponse() {
  return new MatchReportError('报告服务返回的数据格式无法识别，请联系赛事管理员', 502)
}

function fromWireRevision(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.fields) || !Array.isArray(value.fields.events))
    return value
  return {
    ...value,
    fields: {
      ...value.fields,
      events: value.fields.events.map((event) =>
        isRecord(event) ? { ...event, id: event.clientEventId } : event,
      ),
    },
  }
}

function toWireCommand(command: SaveReportCommand) {
  const base = {
    ...(command.editorToken ? { editorToken: command.editorToken } : {}),
    clientActionId: command.clientActionId,
    expectedVersion: command.expectedVersion,
    action: command.action,
    reason: command.reason,
  }
  if (command.action === 'RETURN' || command.action === 'CONFIRM') return base
  return {
    ...base,
    homeRosterSnapshotId: command.homeRosterSnapshotId,
    awayRosterSnapshotId: command.awayRosterSnapshotId,
    ruleVersionId: command.ruleVersionId,
    fields: {
      ...command.fields,
      events: command.fields.events.map(({ id, ...event }) => ({ ...event, clientEventId: id })),
    },
  }
}
