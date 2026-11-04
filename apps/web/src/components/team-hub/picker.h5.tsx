import { useRef, useState } from 'react'
import { announcePrimaryTeamSet } from '../public-shell/navigation-transition.h5'
import { createPortal } from 'react-dom'
import Taro from '@tarojs/taro'
import { productRepository } from '../../features/product/product.repository'
import type { TeamPreferencesResponse, TeamSummary } from '../../features/product/product.types'
import { TEAM_PREFERENCES_EVENT } from '../../features/product/team-navigation.h5'
import { updatePrimaryTeamCache } from '../public-shell'
import { TeamCrest } from '../product-ui'
import { useOverlayFocus } from '../overlay-focus'
import { TeamIcon } from './icons.h5'
import { Empty } from './content.h5'

export function publishPreferences(preferences: TeamPreferencesResponse) {
  updatePrimaryTeamCache(preferences.primaryTeam)
  window.dispatchEvent(new CustomEvent(TEAM_PREFERENCES_EVENT, { detail: preferences }))
}

/** The preferences as they will be once `team` is primary (old primary becomes followed). */
export function withPrimary(
  preferences: TeamPreferencesResponse,
  team: TeamSummary,
): TeamPreferencesResponse {
  const previous = preferences.primaryTeam
  return {
    ...preferences,
    primaryTeam: team,
    followedTeams: [
      ...(previous && previous.id !== team.id ? [previous] : []),
      ...preferences.followedTeams.filter(
        (item) => item.id !== team.id && item.id !== previous?.id,
      ),
    ],
  }
}

export function TeamPicker({
  mode,
  preferences,
  teams,
  onClose,
  onSaved,
}: {
  mode: 'primary' | 'follow'
  preferences: TeamPreferencesResponse | null
  teams: TeamSummary[]
  onClose: () => void
  onSaved: (value: TeamPreferencesResponse) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(preferences?.primaryTeam?.id ?? '')
  const [followed, setFollowed] = useState(
    () => new Set(preferences?.followedTeams.map((team) => team.id)),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const close = () => {
    if (!locked.current) onClose()
  }
  useOverlayFocus(true, '.th-picker', close)
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  const visible = teams.filter((team) =>
    `${team.name} ${team.shortName} ${team.collegeName ?? ''}`
      .toLocaleLowerCase('zh-CN')
      .includes(normalized),
  )
  const save = async () => {
    if (!selected || locked.current) return
    if (!preferences) {
      await Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    locked.current = true
    setBusy(true)
    setError('')
    // 主队 choice shows at once (nav crest + stroke growth once the picker closes).
    const chosen = mode === 'primary' ? teams.find((team) => team.id === selected) : undefined
    if (chosen) {
      announcePrimaryTeamSet()
      publishPreferences(withPrimary(preferences, chosen))
      onClose()
    }
    try {
      // Read the latest preference before replacing it; primary-only edits preserve follows.
      const current = await productRepository.getTeamPreferences()
      const ids = mode === 'primary' ? current.followedTeams.map((team) => team.id) : [...followed]
      const nextPrimary = mode === 'primary' ? selected : current.primaryTeam?.id || selected
      const next = await productRepository.updateTeamPreferences(
        nextPrimary,
        ids.filter((id) => id !== nextPrimary),
      )
      publishPreferences(next)
      onSaved(next)
      if (!chosen) onClose()
    } catch (issue) {
      if (chosen) {
        publishPreferences(preferences)
        void Taro.showToast({ title: '主队保存失败，请重试', icon: 'none' })
      }
      setError(issue instanceof Error ? issue.message : '保存失败，请重试')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }
  return createPortal(
    <div
      className="th-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section
        className="th-picker th-root xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="th-picker-title"
      >
        <div className="th-heading xq-dialog__header">
          <div>
            <h2 id="th-picker-title">{mode === 'primary' ? '选择我的主队' : '关注更多球队'}</h2>
            <p className="th-small-note">
              {mode === 'primary'
                ? '选择一支主队，把每一场热爱放在心上。'
                : '选择你想持续关注的球队。'}
            </p>
          </div>
          <button
            data-team-control
            type="button"
            className="th-icon-button"
            aria-label="关闭球队选择"
            disabled={busy}
            onClick={close}
          >
            <TeamIcon name="close" />
          </button>
        </div>
        <label className="th-search">
          <TeamIcon name="search" />
          <input
            data-team-control
            aria-label="搜索球队"
            placeholder="搜索球队名称或学院"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button
              data-team-control
              type="button"
              aria-label="清空球队搜索"
              onClick={() => setQuery('')}
            >
              <TeamIcon name="close" />
            </button>
          ) : null}
        </label>
        <div className="th-picker__summary">
          {normalized ? `找到 ${visible.length} 支球队` : `全部球队 · ${teams.length}`}
        </div>
        <div className="th-picker__list">
          {visible.map((team) => {
            const active =
              mode === 'primary'
                ? selected === team.id
                : followed.has(team.id) || selected === team.id
            return (
              <button
                type="button"
                data-team-control
                data-team-action
                data-team-id={team.id}
                key={team.id}
                className={`th-picker__team ${active ? 'is-selected' : ''}`}
                aria-pressed={active}
                disabled={busy || (mode === 'follow' && selected === team.id)}
                onClick={() => {
                  if (mode === 'primary') setSelected(team.id)
                  else
                    setFollowed((current) => {
                      const next = new Set(current)
                      if (next.has(team.id)) next.delete(team.id)
                      else next.add(team.id)
                      return next
                    })
                }}
              >
                <TeamCrest team={team} interactive={false} />
                <span>
                  <strong>{team.name}</strong>
                  <small>{team.collegeName ?? '校园球队'}</small>
                </span>
                <span className="th-picker__check">{active ? '✓' : ''}</span>
              </button>
            )
          })}
          {!visible.length ? (
            <Empty title="没有找到对应球队" copy="试试其他球队名称或学院。" />
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="th-inline-error">
            {error}
          </p>
        ) : null}
        <footer className="th-picker__footer xq-dialog__footer">
          <span className="th-muted">
            {preferences
              ? mode === 'primary'
                ? '每个账号可设置一支主队'
                : `已选 ${followed.size} 支关注球队`
              : '登录后可保存主队和关注'}
          </span>
          <button
            data-team-control
            type="button"
            className="th-primary-button"
            disabled={busy || !selected}
            onClick={() => void save()}
          >
            {busy
              ? '正在保存…'
              : preferences
                ? mode === 'primary'
                  ? '设为主队'
                  : '保存关注'
                : '登录并选择主队'}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
