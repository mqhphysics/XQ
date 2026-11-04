import { useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { TeamCrest } from '../../components/product-ui'
import { createClientActionId } from '../product/product.repository'
import { CoverCropper, CrestCropper } from '../../components/avatar-cropper/index.h5'
import { mediaRequest, type MediaAsset } from '../managed-media/repository.h5'
import { teamBackgroundUrl } from '../managed-media/backgrounds.h5'
import type { TeamDashboardResponse } from '../product/product.types'
import { RosterApiError } from './roster.repository'
import {
  teamManagementRepository,
  type CaptainTeamProfile,
  type TeamProfileCommand,
} from './team-management.repository'
import { Icon } from './manage-icons.h5'

const splitMottos = (value: string | null | undefined) =>
  (value ?? '')
    .split(/[·|,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
const joinMottos = (tags: string[]) => tags.join(' · ')

interface Draft {
  name: string
  shortName: string
  collegeName: string
  foundedYear: string
  description: string
  mottos: string[]
}

const toDraft = (team: CaptainTeamProfile): Draft => ({
  name: team.name,
  shortName: team.shortName ?? '',
  collegeName: team.collegeName ?? '',
  foundedYear: team.foundedYear ? String(team.foundedYear) : '',
  description: team.description ?? '',
  mottos: splitMottos(team.motto),
})

export function ManageProfileSection({
  teamId,
  team,
  dashboard,
  onSaved,
}: {
  teamId: string
  team: CaptainTeamProfile
  dashboard: TeamDashboardResponse | null
  onSaved: (team: CaptainTeamProfile) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => toDraft(team))
  const [uploading, setUploading] = useState<'crest' | 'cover' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pendingKey = useRef<string | null>(null)

  useEffect(() => {
    if (!editing) setDraft(toDraft(team))
  }, [team, editing])

  const view = editing ? draft : toDraft(team)
  const yearValid = !draft.foundedYear || /^(19|20)\d{2}$/.test(draft.foundedYear)
  const canSave = draft.name.trim().length > 0 && yearValid

  const buildPatch = (): TeamProfileCommand['patch'] => {
    const patch: TeamProfileCommand['patch'] = {}
    const original = toDraft(team)
    if (draft.name.trim() !== original.name) patch.name = draft.name.trim()
    if (draft.shortName.trim() !== original.shortName)
      patch.shortName = draft.shortName.trim() || null
    if (draft.collegeName.trim() !== original.collegeName)
      patch.collegeName = draft.collegeName.trim() || null
    if (draft.description.trim() !== original.description)
      patch.description = draft.description.trim() || null
    if (joinMottos(draft.mottos) !== joinMottos(original.mottos))
      patch.motto = draft.mottos.length ? joinMottos(draft.mottos) : null
    if (draft.foundedYear !== original.foundedYear)
      patch.foundedYear = draft.foundedYear ? Number(draft.foundedYear) : null
    return patch
  }

  const requestSave = () => {
    setError('')
    if (!canSave) {
      setError(!draft.name.trim() ? '球队名称不能为空' : '成立年份请填写四位年份')
      return
    }
    if (!Object.keys(buildPatch()).length) {
      setEditing(false)
      return
    }
    void save()
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    pendingKey.current ??= createClientActionId('team-profile')
    try {
      const saved = await teamManagementRepository.saveProfile(
        teamId,
        { expectedUpdatedAt: team.updatedAt, patch: buildPatch(), reason: '更新球队资料' },
        pendingKey.current,
      )
      pendingKey.current = null
      onSaved(saved)
      setEditing(false)
      void Taro.showToast({ title: '已保存', icon: 'success' })
    } catch (issue) {
      if (issue instanceof RosterApiError && issue.status === 409) pendingKey.current = null
      setError(
        issue instanceof RosterApiError && issue.status === 409
          ? '资料已被他人更新，请关闭后重新打开再编辑'
          : issue instanceof Error
            ? issue.message
            : '保存失败',
      )
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setDraft(toDraft(team))
    setEditing(false)
    setError('')
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const facts = [
    { label: '球队成员', value: dashboard ? String(dashboard.roster.length) : '—' },
    { label: '已赛场次', value: dashboard ? String(dashboard.stats.played) : '—' },
    { label: '所在小组', value: dashboard?.team.groupName ?? '—' },
    { label: '积分', value: dashboard ? String(dashboard.stats.points) : '—' },
  ]
  // The stored 2.80:1 background (captain upload, else the pre-cropped default) — the same image
  // and frame as the public team banner.
  const cover = teamBackgroundUrl(team.coverUrl)

  const uploadMedia = async (purpose: 'TEAM_CREST' | 'TEAM_BACKGROUND', dataUrl: string) => {
    await mediaRequest<MediaAsset>(
      'media-assets',
      { purpose, targetId: teamId, clientSubmissionId: crypto.randomUUID(), dataUrl },
      'POST',
    )
    const fresh = await teamManagementRepository.read(teamId)
    onSaved(fresh.team)
    setUploading(null)
    window.dispatchEvent(new Event('xiaoqiu:media-changed'))
    window.dispatchEvent(new CustomEvent('xiaoqiu:team-profile:changed', { detail: teamId }))
    void Taro.showToast({
      title: purpose === 'TEAM_CREST' ? '队徽已更新' : '球队背景已更新',
      icon: 'success',
    })
  }

  return (
    <div className={`cmx-profile ${editing ? 'is-editing' : ''}`}>
      <div className="cmx-profile__hero">
        <img className="cmx-profile__cover-img" src={cover} alt="" draggable={false} />
        <div className="cmx-profile__toolbar">
          {editing ? (
            <>
              <button
                type="button"
                className="cmx-profile__tool"
                disabled={saving}
                onClick={cancel}
              >
                取消
              </button>
              <button
                type="button"
                className="cmx-profile__tool cmx-profile__tool--primary"
                disabled={saving}
                aria-busy={saving}
                onClick={requestSave}
              >
                {saving ? '保存中…' : '完成'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="cmx-profile__edit"
              aria-label="编辑资料"
              onClick={() => setEditing(true)}
            >
              <span>编辑资料</span>
              <Icon name="edit" size={15} />
            </button>
          )}
        </div>
        {error ? (
          <span className="cmx-error cmx-profile__error" role="alert">
            {error}
          </span>
        ) : null}
        {editing ? (
          <button
            type="button"
            className="cmx-profile__cover-change"
            onClick={() => setUploading('cover')}
          >
            <Icon name="edit" size={13} />
            更换背景
          </button>
        ) : null}
        <div className="cmx-profile__main">
          {editing ? (
            <button
              type="button"
              className="cmx-profile__crest cmx-profile__crest--editable"
              aria-label="更换队徽"
              onClick={() => setUploading('crest')}
            >
              <TeamCrest team={team} size="large" interactive={false} />
              <span className="cmx-profile__crest-hint">更换队徽</span>
            </button>
          ) : (
            <div className="cmx-profile__crest">
              <TeamCrest team={team} size="large" interactive={false} />
            </div>
          )}
          <div className="cmx-profile__identity">
            {editing ? (
              <div className="cmx-profile__name-edit">
                <input
                  className="cmx-input cmx-input--title"
                  value={draft.name}
                  maxLength={40}
                  aria-label="球队名称"
                  placeholder="球队名称"
                  onChange={(event) => set('name', event.target.value)}
                />
                <input
                  className="cmx-input cmx-input--short"
                  value={draft.shortName}
                  maxLength={12}
                  aria-label="球队简称"
                  placeholder="简称"
                  title="球队简称"
                  onChange={(event) => set('shortName', event.target.value)}
                />
              </div>
            ) : (
              <h3 className="cmx-profile__name">
                {team.name}
                {team.shortName && team.shortName !== team.name ? (
                  <span className="cmx-profile__short">{team.shortName}</span>
                ) : null}
              </h3>
            )}
            {editing ? (
              <div className="cmx-profile__meta-edit">
                <input
                  className="cmx-input"
                  value={draft.collegeName}
                  maxLength={40}
                  aria-label="学院"
                  placeholder="所属学院"
                  onChange={(event) => set('collegeName', event.target.value)}
                />
                <label className="cmx-inline-field">
                  <span>成立于</span>
                  <input
                    className={`cmx-input cmx-input--year ${yearValid ? '' : 'is-invalid'}`}
                    value={draft.foundedYear}
                    inputMode="numeric"
                    maxLength={4}
                    aria-label="成立年份"
                    placeholder="2016"
                    onChange={(event) => set('foundedYear', event.target.value.replace(/\D/g, ''))}
                  />
                  <span>年</span>
                </label>
              </div>
            ) : (
              <p className="cmx-profile__meta">
                {team.collegeName ?? '校园足球球队'}
                {team.foundedYear ? <span>· 成立于 {team.foundedYear} 年</span> : null}
              </p>
            )}
            <MottoPills
              editing={editing}
              tags={view.mottos}
              onChange={(tags) => set('mottos', tags)}
            />
          </div>
          <dl className="cmx-profile__facts">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dd>{fact.value}</dd>
                <dt>{fact.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="cmx-profile__intro">
        <h4>球队简介</h4>
        {editing ? (
          <div className="cmx-textarea-wrap">
            <textarea
              className="cmx-textarea"
              value={draft.description}
              maxLength={500}
              rows={4}
              aria-label="球队简介"
              placeholder="介绍一下球队的历史、风格和训练时间"
              onChange={(event) => set('description', event.target.value)}
            />
            <span className="cmx-counter">{draft.description.length}/500</span>
          </div>
        ) : (
          <p className={team.description ? '' : 'is-empty'}>
            {team.description ?? '还没有简介，点击「编辑资料」补充。'}
          </p>
        )}
      </div>
      {uploading === 'crest' ? (
        <CrestCropper
          onCancel={() => setUploading(null)}
          onConfirm={(dataUrl) => uploadMedia('TEAM_CREST', dataUrl)}
        />
      ) : uploading === 'cover' ? (
        <CoverCropper
          title="更换球队背景"
          onCancel={() => setUploading(null)}
          onConfirm={(dataUrl) => uploadMedia('TEAM_BACKGROUND', dataUrl)}
        />
      ) : null}
    </div>
  )
}

function MottoPills({
  editing,
  tags,
  onChange,
}: {
  editing: boolean
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  useEffect(() => {
    if (!editing) {
      setAdding(false)
      setValue('')
    }
  }, [editing])
  const commit = () => {
    const next = value.trim().replace(/[·|,，]/g, ' ')
    if (next && !tags.includes(next) && joinMottos([...tags, next]).length <= 160)
      onChange([...tags, next])
    setValue('')
    setAdding(false)
  }
  if (!editing && !tags.length) return null
  return (
    <div className="cmx-pills" aria-label="球队口号">
      {tags.map((tag) => (
        <span className="cmx-pill" key={tag}>
          {tag}
          {editing ? (
            <button
              type="button"
              className="cmx-pill__remove"
              aria-label={`删除口号 ${tag}`}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
            >
              <Icon name="x" size={11} />
            </button>
          ) : null}
        </span>
      ))}
      {editing ? (
        adding ? (
          <input
            className="cmx-pill cmx-pill--input"
            value={value}
            maxLength={24}
            autoFocus
            aria-label="新口号"
            placeholder="输入后回车"
            onChange={(event) => setValue(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit()
              }
              if (event.key === 'Escape') {
                setValue('')
                setAdding(false)
              }
            }}
          />
        ) : (
          <button type="button" className="cmx-pill cmx-pill--add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={12} />
            添加口号
          </button>
        )
      ) : null}
    </div>
  )
}
