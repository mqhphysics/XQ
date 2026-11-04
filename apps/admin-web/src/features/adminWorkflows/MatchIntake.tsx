import { useState, useEffect, useRef } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { Modal, DataState, useAdminData, type Row } from '../adminCenter/shared'
import { SheetEditor } from './AdminSheetImport'
import { genericSheetPrompt } from './generic-sheet-prompt'
import { intakeState } from './intake-state'
type Match = Row & {
  tournamentId: string
  scheduledStartAt: string | null
  matchCode: string
  status: string
  recorded?: boolean
  homeTeam: { name: string } | null
  awayTeam: { name: string } | null
}
const stamp = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '时间待定'
export function MatchIntake({
  context,
  initialMatchId,
}: {
  context: OrganizationContext
  initialMatchId?: string
}) {
  const result = useAdminData<{
    matches: Match[]
    tournaments: Array<{ id: string; name: string; seasonId: string }>
    seasons: Array<{ id: string; name: string }>
  }>(context, '/admin/schedule-workbench')
  const [selected, setSelected] = useState<Match | null>(null),
    [query, setQuery] = useState(''),
    [showAll, setShowAll] = useState(false),
    [copied, setCopied] = useState(false)
  const opened = useRef('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (initialMatchId && result.data && opened.current !== initialMatchId) {
      const match = result.data.matches.find((m) => m.id === initialMatchId)
      if (match) {
        setSelected(match)
        opened.current = initialMatchId
      }
    }
  }, [initialMatchId, result.data])
  const rows = (result.data?.matches ?? [])
    .filter((m) => m.homeTeam && m.awayTeam && m.status !== 'CANCELLED')
    .filter((m) => {
      const t = result.data?.tournaments.find((t) => t.id === m.tournamentId)
      const season = result.data?.seasons.find((s) => s.id === t?.seasonId)
      return season?.name.includes('2026') && !/演示/.test(season.name)
    })
    .sort(
      (a, b) =>
        (Date.parse(a.scheduledStartAt ?? '') || Infinity) -
          (Date.parse(b.scheduledStartAt ?? '') || Infinity) ||
        a.matchCode.localeCompare(b.matchCode, 'zh-CN', { numeric: true }),
    )
    .filter((m) =>
      `${m.homeTeam?.name} ${m.awayTeam?.name} ${m.matchCode} ${stamp(m.scheduledStartAt)}`.includes(
        query.trim(),
      ),
    )
  const recent = rows.filter(
    (m) =>
      m.scheduledStartAt &&
      Date.parse(m.scheduledStartAt) >= Date.now() - 7 * 86400000 &&
      Date.parse(m.scheduledStartAt) <= Date.now() + 7 * 86400000,
  )
  const visible = showAll || query.trim() ? rows : recent
  const grouped = new Map<string, Match[]>()
  for (const match of visible) {
    const key = match.scheduledStartAt
      ? new Date(match.scheduledStartAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
      : '时间待定'
    grouped.set(key, [...(grouped.get(key) ?? []), match])
  }
  return (
    <>
      <section className="mc-panel intake-toolbar">
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(genericSheetPrompt).then(() => setCopied(true))
          }
        >
          {copied ? '通用提示词已复制' : '复制通用识别提示词'}
        </button>
        <input
          aria-label="查找录入比赛"
          placeholder="日期、球队"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="secondary-button" onClick={() => setShowAll(!showAll)}>
          {showAll ? '近期比赛' : '全部2026比赛'}
        </button>
      </section>
      <DataState {...result} onRetry={result.refresh} />
      {!visible.length && <p className="mc-muted">近期没有比赛，可查看全部2026比赛。</p>}
      {[...grouped].map(([date, matches]) => (
        <section className="intake-day" key={date}>
          <h2>{date}</h2>
          <div className="intake-grid">
            {matches.map((m) => {
              const tournamentName =
                result.data?.tournaments.find((t) => t.id === m.tournamentId)?.name ?? ''
              const state = intakeState({ ...m, tournamentName }, now)
              return (
                <button
                  className={`intake-match intake-match--${state.kind}`}
                  key={m.id}
                  onClick={() => setSelected(m)}
                >
                  <span>{stamp(m.scheduledStartAt)}</span>
                  <strong>
                    {m.homeTeam?.name} <span>—</span> {m.awayTeam?.name}
                  </strong>
                  <span>
                    {tournamentName} · <b>{state.label}</b>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
      {selected && (
        <Modal
          title={`${selected.homeTeam?.name} — ${selected.awayTeam?.name} · ${stamp(selected.scheduledStartAt)}`}
          className="intake-dialog"
          onClose={() => {
            setSelected(null)
            result.refresh()
          }}
        >
          <SheetEditor
            context={context}
            matchId={selected.id}
            tournamentId={selected.tournamentId}
            scheduledStartAt={selected.scheduledStartAt}
            genericPrompt
          />
        </Modal>
      )}
    </>
  )
}
