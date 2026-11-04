import { useCallback, useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { createClientActionId } from '../product/product.repository'
import { RosterApiError } from './roster.repository'
import {
  teamManagementRepository,
  type CaptainTeamProfile,
  type TeamProfileCommand,
} from './team-management.repository'
import type { CaptainProfileEditorProps } from './profile-editor'
import './profile-editor.scss'

const fields = [
  { key: 'name', label: '球队名称', max: 160, required: true },
  { key: 'shortName', label: '球队简称', max: 80 },
  { key: 'collegeName', label: '学院', max: 160 },
  { key: 'motto', label: '球队口号', max: 160 },
  { key: 'foundedYear', label: '成立年份', number: true },
  { key: 'primaryColor', label: '球队主色（#RRGGBB）', max: 7, color: true },
  { key: 'secondaryColor', label: '球队辅色（#RRGGBB）', max: 7, color: true },
  { key: 'description', label: '球队简介', max: 600, multiline: true },
] as const

const splitMottos = (value: string) =>
  value
    .split(/[·|,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
const joinMottos = (tags: string[]) => tags.join(' · ')

type FieldKey = (typeof fields)[number]['key']
const valuesFrom = (team: CaptainTeamProfile): Record<FieldKey, string> =>
  Object.fromEntries(
    fields.map(({ key }) => [key, team[key] == null ? '' : String(team[key])]),
  ) as Record<FieldKey, string>

export default function CaptainProfileEditor({ teamId, onChange, defaultExpanded = false }: CaptainProfileEditorProps) {
  const [team, setTeam] = useState<CaptainTeamProfile | null>(null)
  const [values, setValues] = useState<Record<FieldKey, string> | null>(null)
  const [reason, setReason] = useState('')
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState<{ input: TeamProfileCommand; key: string } | null>(null)
  const locked = useRef(false)
  const generation = useRef(0)
  const notify = useRef(onChange)
  notify.current = onChange
  const load = useCallback(async () => {
    const request = ++generation.current
    setLoading(true)
    setError('')
    try {
      const workspace = await teamManagementRepository.read(teamId)
      if (request !== generation.current) return
      if (!workspace.team.updatedAt)
        throw new Error('球队资料缺少服务器版本，请检查 API 是否已更新。')
      setTeam(workspace.team)
      setValues(valuesFrom(workspace.team))
      setPending(null)
      setReason('')
      notify.current(workspace)
    } catch (issue) {
      if (request === generation.current)
        setError(issue instanceof Error ? issue.message : '球队资料加载失败')
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [teamId])
  useEffect(() => {
    void load()
    return () => {
      generation.current += 1
    }
  }, [load])
  const changed = Boolean(
    team && values && fields.some(({ key }) => values[key] !== valuesFrom(team)[key]),
  )
  const save = async (retry = false) => {
    if (!team || !values || locked.current) return
    let request = retry ? pending : null
    if (!request) {
      if (!changed) {
        setError('请先修改球队资料。')
        return
      }
      if (reason.trim().length < 2) {
        setError('请填写至少 2 个字的修改原因。')
        return
      }
      request = {
        key: createClientActionId('team-profile'),
        input: {
          expectedUpdatedAt: team.updatedAt,
          reason: reason.trim(),
          patch: Object.fromEntries(
            fields
              .filter(({ key }) => values[key] !== valuesFrom(team)[key])
              .map(({ key }) => [
                key,
                key === 'foundedYear'
                  ? values[key]
                    ? Number(values[key])
                    : null
                  : values[key].trim() || null,
              ]),
          ) as TeamProfileCommand['patch'],
        },
      }
    }
    locked.current = true
    setBusy(true)
    setError('')
    setNotice('')
    const requestGeneration = generation.current
    try {
      const saved = await teamManagementRepository.saveProfile(teamId, request.input, request.key)
      if (requestGeneration !== generation.current) return
      setTeam(saved)
      setValues(valuesFrom(saved))
      setPending(null)
      setReason('')
      setNotice('球队资料已保存到服务器，刷新后仍保留。')
      // Read the full workspace after saving so member data and the public header stay in sync.
      try {
        const workspace = await teamManagementRepository.read(teamId)
        if (requestGeneration === generation.current) notify.current(workspace)
      } catch {
        if (requestGeneration === generation.current)
          setNotice('球队资料已保存到服务器；页面资料重新读取失败，可点击重新读取。')
      }
    } catch (issue) {
      if (requestGeneration !== generation.current) return
      setError(
        issue instanceof RosterApiError && issue.status === 409
          ? '球队资料已被其他人修改，请重新读取最新资料后再保存。'
          : issue instanceof Error
            ? issue.message
            : '球队资料保存失败',
      )
      setPending(
        !(issue instanceof RosterApiError) || issue.status === 0 || issue.status >= 500
          ? request
          : null,
      )
    } finally {
      locked.current = false
      if (requestGeneration === generation.current) setBusy(false)
    }
  }
  const reload = async () => {
    if (busy || loading) return
    if (changed || pending) {
      const answer = await Taro.showModal({
        title: '重新读取球队资料',
        content: '将读取服务器最新资料，并替换当前未保存的编辑。',
        confirmText: '重新读取',
      })
      if (!answer.confirm) return
    }
    setNotice('')
    await load()
  }
  return (
    <section className="captain-profile surface" aria-label="队长编辑球队资料">
      <div className="captain-profile__heading">
        <div>
          <h3>球队资料</h3>
          <p>队长可以维护本队介绍与颜色。报名资格由赛事管理员审核。</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? '收起编辑' : '编辑球队资料'}
        </button>
      </div>
      {loading ? <p role="status">正在读取球队资料…</p> : null}
      {expanded && values ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset
            disabled={busy || loading || Boolean(pending)}
            className="captain-profile__fields"
          >
            {fields.map((field) =>
              field.key === 'motto' ? (
                <MottoTags
                  key={field.key}
                  value={values.motto}
                  disabled={busy || loading || Boolean(pending)}
                  onChange={(next) => setValues({ ...values, motto: next })}
                />
              ) : (
                <label
                  key={field.key}
                  className={'multiline' in field ? 'captain-profile__wide' : ''}
                >
                  <span>{field.label}</span>
                  {'multiline' in field ? (
                    <textarea
                      className="captain-profile__textarea"
                      value={values[field.key]}
                      maxLength={field.max}
                      onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                    />
                  ) : (
                    <input
                      value={values[field.key]}
                      required={'required' in field && field.required}
                      maxLength={'max' in field ? field.max : undefined}
                      type={'number' in field ? 'number' : 'text'}
                      min={'number' in field ? 1800 : undefined}
                      max={'number' in field ? 2200 : undefined}
                      step={'number' in field ? 1 : undefined}
                      pattern={'color' in field ? '#[0-9a-fA-F]{6}' : undefined}
                      onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                    />
                  )}
                </label>
              ),
            )}
            <label className="captain-profile__wide">
              <span>修改原因</span>
              <input
                value={reason}
                required
                minLength={2}
                maxLength={500}
                placeholder="说明本次修改"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </fieldset>
          <div className="captain-profile__actions">
            <button type="submit" disabled={!changed || busy || loading || Boolean(pending)}>
              {busy ? '保存中…' : '保存球队资料'}
            </button>
            <span>{changed ? '有未保存的编辑' : '已读取服务器资料'}</span>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="captain-profile__error" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <div className="captain-profile__actions">
          <span>上次保存结果尚未确认。</span>
          <button type="button" disabled={busy} onClick={() => void save(true)}>
            重试原保存
          </button>
        </div>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <button
        type="button"
        className="captain-profile__refresh"
        disabled={busy || loading}
        onClick={() => void reload()}
      >
        重新读取资料
      </button>
    </section>
  )
}

function MottoTags({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const tags = splitMottos(value)
  const [draft, setDraft] = useState('')
  const add = () => {
    const next = draft.trim()
    if (!next || tags.includes(next) || tags.length >= 8) return
    onChange(joinMottos([...tags, next]))
    setDraft('')
  }
  return (
    <label className="captain-profile__wide captain-profile__motto-tags">
      <span>球队口号（可添加多条）</span>
      <div className="captain-profile__tag-row">
        {tags.map((tag) => (
          <button
            type="button"
            key={tag}
            className="captain-profile__tag"
            disabled={disabled}
            onClick={() => onChange(joinMottos(tags.filter((item) => item !== tag)))}
          >
            {tag} ×
          </button>
        ))}
        <input
          value={draft}
          disabled={disabled || tags.length >= 8}
          maxLength={24}
          placeholder={tags.length >= 8 ? '最多 8 条' : '输入后回车添加'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <button type="button" disabled={disabled || !draft.trim() || tags.length >= 8} onClick={add}>
          添加
        </button>
      </div>
    </label>
  )
}
