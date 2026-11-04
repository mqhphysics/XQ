import type { EventKind, ReportFields, ReportPlayer, ReportSide, ReportWorkspace } from './types'
import { genericSheetPrompt } from './generic-sheet-prompt.ts'

export interface SheetPreview {
  fields: ReportFields
  warnings: string[]
  eventLabels: string[]
  starters: { HOME: string[]; AWAY: string[] } | null
  starterLabels: string[]
  starterWarnings: string[]
  bulletin?: { title: string; body: string } | null
  date?: string
}
const kinds: EventKind[] = ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION']
const normalize = (value: string) =>
  value
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .normalize('NFKC')
const normalizeTeam = (value: string) => {
  const name = normalize(value).replace(/女足$/, '')
  const aliases: Record<string, string> = {
    物一: '物一',
    物院一队: '物一',
    物理学院一队: '物一',
    物二: '物二',
    物院二队: '物二',
    物理学院二队: '物二',
    数一: '数一',
    数院一队: '数一',
    数学一队: '数一',
    数二: '数二',
    数院二队: '数二',
    数学二队: '数二',
    文学院: '文院',
    教育学院: '教院',
    化学学院: '化院',
    计算机学院: '计科',
    历史文化学院: '历院',
    音乐学院: '音乐',
    人工智能学院: '人智',
    信息管理学院: '信管',
  }
  return aliases[name] ?? name
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('需要一个JSON对象。')
  return value as Record<string, unknown>
}
function only(value: Record<string, unknown>, keys: string[]) {
  const unknown = Object.keys(value).find((key) => !keys.includes(key))
  if (unknown) throw new Error(`不支持字段“${unknown}”，请使用本页提供的格式。`)
}
function score(value: unknown) {
  if (value === null || value === undefined)
    throw new Error('最终比分未识别，不能保存赛果或发布快报；请核对原表。')
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 99)
    throw new Error('比分必须是0到99的整数。')
  return String(value)
}
function minute(value: unknown, max: number) {
  if (value === null || value === undefined || value === '') return ''
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > max)
    throw new Error('事件分钟或补时无效。')
  return String(value)
}
function resolvePlayer(
  players: ReportPlayer[],
  number: unknown,
  name: unknown,
  warnings: string[],
  label: string,
) {
  if (
    number !== undefined &&
    number !== null &&
    typeof number !== 'string' &&
    !Number.isInteger(number)
  )
    throw new Error(`${label}号码无效。`)
  if (name !== undefined && name !== null && typeof name !== 'string')
    throw new Error(`${label}姓名无效。`)
  const shirt = number === undefined || number === null ? '' : String(number).trim()
  const realName = typeof name === 'string' ? normalize(name) : ''
  if (!shirt && !realName) {
    warnings.push(`${label}尚未确定球员，暂不投影这条事件。`)
    return ''
  }
  const candidates = players.filter(
    (p) =>
      (!shirt || p.shirtNumber === shirt) && (!realName || normalize(p.displayName) === realName),
  )
  if (candidates.length === 0) {
    warnings.push(`${label}未能在本队名单匹配，保留比分，暂不写入该球员事件。`)
    return ''
  }
  if (candidates.length !== 1)
    throw new Error(
      `${label}无法在本场锁定名单唯一匹配，请核对姓名和球衣号码；不会自动创建或合并球员。`,
    )
  return candidates[0]!.id
}
/** Parsing selects only players in the server-provided frozen roster; server authorization remains authoritative. */
export function parseMatchSheet(source: string, workspace: ReportWorkspace): SheetPreview {
  if (source.length > 100000) throw new Error('内容过长，请只粘贴一场比赛。')
  const fenced = source
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let value: unknown
  try {
    value = JSON.parse(fenced)
  } catch (error) {
    throw new Error(
      `JSON格式无法读取，请复制完整对象并检查字符串引号。${error instanceof Error ? error.message : ''}`,
    )
  }
  if (Array.isArray(value)) {
    const matches = value.filter(
      (item) =>
        item &&
        typeof item === 'object' &&
        normalizeTeam(String(item.homeTeam)) === normalizeTeam(workspace.homeTeam.name) &&
        normalizeTeam(String(item.awayTeam)) === normalizeTeam(workspace.awayTeam.name),
    )
    if (matches.length !== 1)
      throw new Error('多场数据中没有唯一匹配当前双方球队的记录，请单独粘贴本场文件。')
    value = matches[0]
  }
  const document = object(value)
  only(document, [
    'schemaVersion',
    'matchId',
    'homeTeam',
    'awayTeam',
    'homeScore',
    'awayScore',
    'events',
    'notes',
    'starters',
    'date',
    'warnings',
    'bulletin',
  ])
  if (
    (document.schemaVersion !== undefined && document.schemaVersion !== 1) ||
    (document.matchId && document.matchId !== workspace.matchId)
  )
    throw new Error('版本或比赛编号与当前选择不一致，请重新核对比赛。')
  if (
    normalizeTeam(String(document.homeTeam)) !== normalizeTeam(workspace.homeTeam.name) ||
    normalizeTeam(String(document.awayTeam)) !== normalizeTeam(workspace.awayTeam.name)
  )
    throw new Error('主客队与当前比赛不一致，不能自动交换比分。')
  if (!Array.isArray(document.events) || document.events.length > 500)
    throw new Error('events必须是最多500条事件的数组。')
  if (document.notes !== undefined && typeof document.notes !== 'string')
    throw new Error('notes必须是文字。')
  const warnings: string[] = [],
    eventLabels: string[] = []
  const fields: ReportFields = {
    homeScore: score(document.homeScore),
    awayScore: score(document.awayScore),
    homePenaltyScore: '',
    awayPenaltyScore: '',
    outcome: 'FINISHED',
    events: [],
    notes: String(document.notes ?? '').slice(0, 800),
  }
  document.events.forEach((raw, index) => {
    const event = object(raw)
    only(event, [
      'kind',
      'side',
      'minute',
      'addedMinute',
      'shirtNumber',
      'playerName',
      'relatedShirtNumber',
      'relatedPlayerName',
    ])
    if (
      !kinds.includes(event.kind as EventKind) ||
      !['HOME', 'AWAY'].includes(event.side as string)
    )
      throw new Error(`第${index + 1}条事件类型或球队无效。`)
    const side = event.side as ReportSide,
      kind = event.kind as EventKind
    const players = side === 'HOME' ? workspace.homeTeam.players : workspace.awayTeam.players
    const time = minute(event.minute, 120),
      addedMinute = minute(event.addedMinute, 30)
    if (time === '') warnings.push(`第${index + 1}条事件时间待核实，不填成0分钟。`)
    const playerId = resolvePlayer(
      players,
      event.shirtNumber,
      event.playerName,
      warnings,
      `第${index + 1}条事件`,
    )
    if (!playerId) return
    const relatedPlayerId =
      kind === 'SUBSTITUTION' || event.relatedPlayerName || event.relatedShirtNumber
        ? resolvePlayer(
            players,
            event.relatedShirtNumber,
            event.relatedPlayerName,
            warnings,
            `第${index + 1}条事件关联球员`,
          )
        : ''
    if (relatedPlayerId && !['SUBSTITUTION', 'GOAL'].includes(kind))
      throw new Error('只有进球助攻或换人可以填写关联球员。')
    if (relatedPlayerId && relatedPlayerId === playerId)
      throw new Error('换上、换下或助攻球员不能是同一个人。')
    fields.events.push({
      clientEventId: `sheet-${index + 1}`,
      kind,
      side,
      minute: time,
      addedMinute,
      playerId,
      relatedPlayerId,
    })
    eventLabels.push(
      `${side === 'HOME' ? '主队' : '客队'} · ${time ? `${time}${addedMinute ? `+${addedMinute}` : ''}′` : '时间待核'} · ${String(event.playerName ?? event.shirtNumber ?? '球员待核')} · ${kind}`,
    )
  })
  const goals = { HOME: 0, AWAY: 0 }
  for (const event of fields.events)
    if (['GOAL', 'OWN_GOAL'].includes(event.kind)) {
      const side =
        event.kind === 'OWN_GOAL' ? (event.side === 'HOME' ? 'AWAY' : 'HOME') : event.side
      goals[side]++
    }
  if (goals.HOME !== Number(fields.homeScore) || goals.AWAY !== Number(fields.awayScore))
    warnings.push('进球事件尚未覆盖最终比分；可以先保存正式比分，事件继续补充。')
  const starters =
    document.starters === undefined ? null : { HOME: [] as string[], AWAY: [] as string[] }
  const starterLabels: string[] = [],
    starterWarnings: string[] = []
  if (starters) {
    const marked = object(document.starters)
    only(marked, ['HOME', 'AWAY'])
    for (const side of ['HOME', 'AWAY'] as const) {
      const list = marked[side]
      if (!Array.isArray(list) || list.length > 8)
        throw new Error('每队勾选首发应为最多8名球员，无法确认的请在备注说明。')
      const players = side === 'HOME' ? workspace.homeTeam.players : workspace.awayTeam.players
      for (const raw of list) {
        const player = object(raw)
        only(player, ['shirtNumber', 'playerName'])
        const id = resolvePlayer(
          players,
          player.shirtNumber,
          player.playerName,
          starterWarnings,
          `${side === 'HOME' ? '主队' : '客队'}首发`,
        )
        if (!id) continue
        if (starters[side].includes(id)) throw new Error('同一球员不能重复出现在首发中。')
        starters[side].push(id)
      }
      if (starters[side].length) {
        starterLabels.push(
          `${side === 'HOME' ? '主队' : '客队'}勾选首发：${starters[side].map((id) => players.find((p) => p.id === id)!.displayName).join('、')}`,
        )
        if (starters[side].length !== 8)
          starterWarnings.push(
            `${side === 'HOME' ? '主队' : '客队'}仅识别到${starters[side].length}名勾选球员；缺项留空，待核对。`,
          )
      }
    }
    if (starterLabels.length) {
      const note = starterLabels.join('；')
      fields.notes = [fields.notes.slice(0, Math.max(0, 797 - note.length)), note]
        .filter(Boolean)
        .join('\n')
    }
  }
  return {
    fields,
    warnings: [
      ...new Set([
        ...warnings,
        ...(Array.isArray(document.warnings)
          ? document.warnings
              .filter((item): item is string => typeof item === 'string')
              .slice(0, 30)
          : []),
      ]),
    ],
    eventLabels,
    starters,
    starterLabels,
    starterWarnings,
    ...(typeof document.date === 'string' && document.date ? { date: document.date } : {}),
    bulletin:
      document.bulletin &&
      typeof document.bulletin === 'object' &&
      typeof (document.bulletin as Record<string, unknown>).title === 'string' &&
      typeof (document.bulletin as Record<string, unknown>).body === 'string'
        ? {
            title: String((document.bulletin as Record<string, unknown>).title).slice(0, 180),
            body: String((document.bulletin as Record<string, unknown>).body).slice(0, 2000),
          }
        : null,
  }
}

export function sheetPrompt(workspace: ReportWorkspace) {
  return `${genericSheetPrompt}\n\n本次只整理以下这一场，输出一个JSON对象：\n主队：${workspace.homeTeam.name}\n客队：${workspace.awayTeam.name}\n主队名单：${workspace.homeTeam.players.map((p) => `${p.shirtNumber ?? '号码未填'} ${p.displayName}`).join('、')}\n客队名单：${workspace.awayTeam.players.map((p) => `${p.shirtNumber ?? '号码未填'} ${p.displayName}`).join('、')}`
}
