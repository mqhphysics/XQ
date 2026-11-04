import { useEffect, useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, Modal, useAdminData } from './shared'
import './campus-management.css'
interface Data {
  competitions: Array<{ id: string; code: string; name: string; cupName?: string; gender?: string }>
  seasons: Array<{ id: string; name: string; isDemo: boolean }>
  tournaments: Array<{
    id: string
    seasonId: string
    competitionDefinitionId: string
    status: string
    name: string
  }>
}
export function CompetitionPicker({
  context,
  onSelect,
  onCreated,
}: {
  context: OrganizationContext
  onSelect: (id: string) => void
  onCreated?: () => void
}) {
  const result = useAdminData<Data>(context, '/admin/campus/competitions')
  const [competitionId, setCompetitionId] = useState(''),
    [seasonId, setSeasonId] = useState(''),
    [creating, setCreating] = useState(false)
  const competitions = result.data?.competitions ?? [],
    seasons = result.data?.seasons ?? []
  const competition =
    competitions.find((c) => c.id === competitionId) ??
    competitions.find((c) => c.code === 'FRESHMEN_MEN') ??
    competitions[0]
  const season =
    seasons.find((s) => s.id === seasonId) ??
    seasons.find((s) => !s.isDemo && s.name.includes('2026')) ??
    seasons.find((s) => !s.isDemo) ??
    seasons[0]
  const instance = result.data?.tournaments.find(
    (t) => t.competitionDefinitionId === competition?.id && t.seasonId === season?.id,
  )
  useEffect(() => {
    if (competition && season) onSelect(instance?.id ?? '')
  }, [competition?.id, season?.id, instance?.id, onSelect])
  return (
    <div className="campus-admin-context">
      <label>
        <span>赛事</span>
        <select
          aria-label="管理赛事"
          value={competition?.id ?? ''}
          onChange={(e) => setCompetitionId(e.target.value)}
          disabled={!competitions.length}
        >
          {competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {/[男女]足/.test(c.name)
                ? c.name
                : `${c.cupName ?? c.name}${c.gender === 'FEMALE' || c.code.endsWith('_WOMEN') ? '（女足）' : c.gender === 'MALE' || c.code.endsWith('_MEN') ? '（男足）' : ''}`}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>赛季</span>
        <select
          aria-label="管理赛季"
          value={season?.id ?? ''}
          onChange={(e) => setSeasonId(e.target.value)}
          disabled={!seasons.length}
        >
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {season && (
        <span className="campus-context-note">
          {instance
            ? instance.status === 'PUBLISHED'
              ? '已发布'
              : '筹备中'
            : '尚未建立该赛季赛事'}
        </span>
      )}
      {!instance && competition && season && context.canManageOrganization && (
        <button type="button" className="mc-link-button" onClick={() => setCreating(true)}>
          建立赛事草稿
        </button>
      )}
      {result.error && <span role="alert">{String(result.error)}</span>}
      {creating && competition && season && (
        <Modal
          title={`建立${competition.name} · ${season.name}`}
          onClose={() => setCreating(false)}
        >
          <p>只建立赛事草稿，参赛队、小组赛和淘汰赛需要后续配置，不会生成演示比赛。</p>
          <ActionForm
            context={context}
            path={`/admin/campus/competitions/${competition.id}/seasons/${season.id}`}
            body={{}}
            submitLabel="建立草稿"
            onDone={() => {
              setCreating(false)
              result.refresh()
              onCreated?.()
            }}
          />
        </Modal>
      )}
    </div>
  )
}
