import { useEffect, useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { ActionForm, Modal, useAdminData } from './shared'
import './campus-management.css'
interface Data {
  defaultTournamentId?: string | null
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
    [dialog, setDialog] = useState<'instance' | 'new' | 'feature' | null>(null),
    [draft, setDraft] = useState({ code: '', cupName: '', gender: 'UNSPECIFIED' })
  const competitions = result.data?.competitions ?? [],
    seasons = result.data?.seasons ?? []
  const featured = result.data?.tournaments.find((t) => t.id === result.data?.defaultTournamentId)
  const competition =
    competitions.find((c) => c.id === competitionId) ??
    competitions.find((c) => c.id === featured?.competitionDefinitionId) ??
    competitions[0]
  const season =
    seasons.find((s) => s.id === seasonId) ??
    seasons.find((s) => s.id === featured?.seasonId) ??
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
        <button type="button" className="mc-link-button" onClick={() => setDialog('instance')}>
          建立赛事草稿
        </button>
      )}
      {context.canManageOrganization && season && !season.isDemo && (
        <button type="button" className="mc-link-button" onClick={() => setDialog('new')}>
          新建杯赛
        </button>
      )}
      {instance?.status === 'PUBLISHED' &&
        context.canManageOrganization &&
        !season?.isDemo &&
        (instance.id === featured?.id ? (
          <span className="campus-context-note">当前首页赛事</span>
        ) : (
          <button type="button" className="mc-link-button" onClick={() => setDialog('feature')}>
            设为首页赛事
          </button>
        ))}
      {result.error && <span role="alert">{String(result.error)}</span>}
      {dialog === 'instance' && competition && season && (
        <Modal title={`建立${competition.name} · ${season.name}`} onClose={() => setDialog(null)}>
          <p>只建立赛事草稿，参赛队、小组赛和淘汰赛需要后续配置，不会生成演示比赛。</p>
          <ActionForm
            context={context}
            path={`/admin/campus/competitions/${competition.id}/seasons/${season.id}`}
            body={{}}
            submitLabel="建立草稿"
            onDone={() => {
              setDialog(null)
              result.refresh()
              onCreated?.()
            }}
          />
        </Modal>
      )}
      {dialog === 'new' && season && (
        <Modal title={`新建杯赛 · ${season.name}`} onClose={() => setDialog(null)}>
          <ActionForm
            context={context}
            path="/admin/campus/competitions"
            body={{ ...draft, seasonId: season.id }}
            submitLabel="建立草稿"
            canSubmit={Boolean(draft.cupName.trim()) && /^[A-Z0-9_-]{2,32}$/.test(draft.code)}
            onDone={() => {
              setDialog(null)
              setDraft({ code: '', cupName: '', gender: 'UNSPECIFIED' })
              result.refresh()
              onCreated?.()
            }}
          >
            <label>
              杯赛名称
              <input
                required
                maxLength={80}
                value={draft.cupName}
                onChange={(e) => setDraft({ ...draft, cupName: e.target.value })}
              />
            </label>
            <label>
              杯赛代码
              <input
                required
                maxLength={32}
                placeholder="TECH_CUP"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              组别
              <select
                value={draft.gender}
                onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
              >
                <option value="UNSPECIFIED">不指定</option>
                <option value="MALE">男足</option>
                <option value="FEMALE">女足</option>
              </select>
            </label>
          </ActionForm>
        </Modal>
      )}
      {dialog === 'feature' && instance && (
        <Modal title="设为首页赛事" onClose={() => setDialog(null)}>
          <p>小程序首页将默认展示 {instance.name}。</p>
          <ActionForm
            context={context}
            path={`/admin/campus/competitions/${instance.id}/feature`}
            body={{}}
            submitLabel="设为首页赛事"
            onDone={() => {
              setDialog(null)
              result.refresh()
              onCreated?.()
            }}
          />
        </Modal>
      )}
    </div>
  )
}
