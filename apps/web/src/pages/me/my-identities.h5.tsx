import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { productRepository } from '../../features/product/product.repository'
import type { AuthUser } from '../../features/product/product.types'
import { identityBadgeKinds, identityLabels } from '../../features/product/identity-badges'
import { openPlayer } from '../../features/product/player-navigation.h5'
import { openPerson } from '../../features/product/person-navigation.h5'
import { identityEntryActions } from '../../features/identity/entry-actions.h5'
import { SelfPlayerEditor } from '../../components/player-overlay/self-editor.h5'
import { SelfPersonEditor } from '../../components/person-overlay/self-editor.h5'
import { VerificationBadge } from '../../components/verification-badge/index.h5'
import { ProfileDialog } from './profile-dialog.h5'
import { ReporterQualityPanel } from '../../components/campus-context/reporter-quality.h5'
import '../../components/campus-context/index.h5.scss'
import './my-identities.h5.scss'

/** 我的身份 only offers 球员 (incl. 队长), 信息管理员, 网站运营 (and a coach's own panel); no 学生. */
type PanelKind = 'player' | 'reporter' | 'operator' | 'coach'

function panelKinds(available: readonly string[], user: AuthUser): PanelKind[] {
  const set = new Set(available)
  const kinds: PanelKind[] = []
  if (user.linkedPlayer || set.has('player') || set.has('captain')) kinds.push('player')
  if (set.has('reporter')) kinds.push('reporter')
  if (set.has('operator') || set.has('admin')) kinds.push('operator')
  if (set.has('coach')) kinds.push('coach')
  return kinds
}

function panelLabel(kind: PanelKind, linked = true) {
  return kind === 'player'
    ? linked
      ? '球员'
      : '队长'
    : kind === 'operator'
      ? '网站运营'
      : identityLabels[kind]
}

export function MyIdentitiesDialog({
  user,
  tournamentId,
  onClose,
  onUserChange,
  onInformation,
  onTeam,
  onMatch,
  onManage,
}: {
  user: AuthUser
  tournamentId: string
  onClose: () => void
  onUserChange: (user: AuthUser) => void
  onPersonal?: () => void
  onInformation: () => void
  onTeam: () => void
  onMatch: () => void
  onManage: () => void
}) {
  const initial = panelKinds(identityBadgeKinds(user.verificationLevel, user.roles), user)
  const [kinds, setKinds] = useState<PanelKind[]>(initial)
  const [selected, setSelected] = useState<PanelKind | null>(initial[0] ?? null)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState<'player' | 'coach' | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void productRepository
      .getBadgePreference()
      .then((data) => {
        if (!active) return
        const available = panelKinds(data.availableKinds, user)
        setKinds(available)
        setSelected((value) =>
          value && available.includes(value) ? value : (available[0] ?? null),
        )
      })
      .catch((issue) => {
        if (active) setError(issue.message)
      })
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [user.id, user.organizationId])
  // Only a player (or captain) identity: go straight to that player's management panel.
  const playerOnly = kinds.length === 1 && kinds[0] === 'player' && Boolean(user.linkedPlayer)
  const label = selected ? panelLabel(selected, Boolean(user.linkedPlayer)) : ''
  const isCaptain = user.roles.some(
    (role) => (typeof role === 'string' ? role : role.role) === 'TEAM_CAPTAIN',
  )
  const open = (action: Promise<void>) => {
    onClose()
    void action.catch((issue) => Taro.showToast({ title: issue.message, icon: 'none' }))
  }
  if (
    playerOnly ||
    (!loaded && initial.length === 1 && initial[0] === 'player' && user.linkedPlayer)
  )
    return (
      <SelfPlayerEditor
        onClose={onClose}
        onSaved={() =>
          window.dispatchEvent(
            new CustomEvent('xiaoqiu:player-profile:changed', { detail: user.linkedPlayer?.id }),
          )
        }
      />
    )
  return (
    <ProfileDialog title="我的身份" note="选择身份，查看或编辑对应资料。" onClose={onClose}>
      <div className="my-identities-tabs" role="tablist" aria-label="切换我的身份">
        {kinds.map((kind) => (
          <button
            key={kind}
            data-profile-button
            role="tab"
            id={`identity-tab-${kind}`}
            aria-selected={selected === kind}
            aria-controls="my-identity-content"
            onClick={() => setSelected(kind)}
          >
            {panelLabel(kind, Boolean(user.linkedPlayer))}
          </button>
        ))}
      </div>
      {error && (
        <p className="profile-error" role="alert">
          {error}
        </p>
      )}
      {loaded && kinds.length === 0 && (
        <div className="my-identity-content my-identity-content--empty">
          <p>暂未认证球员、信息管理员或网站运营身份。可点击下方“自动匹配”关联你的球员档案。</p>
        </div>
      )}
      {selected && (
        <div
          className="my-identity-content"
          id="my-identity-content"
          role="tabpanel"
          aria-labelledby={`identity-tab-${selected}`}
        >
          <div className="profile-current-identity">
            <VerificationBadge
              level={user.verificationLevel}
              roles={user.roles}
              displayedKind={selected}
            />
            <strong>{label}</strong>
          </div>
          <p>
            {selected === 'player'
              ? user.linkedPlayer
                ? '你的球员档案、技术资料与赛季表现。'
                : '维护本队资料、成员与比赛名单。'
              : selected === 'coach'
                ? '你的教练资料与球队管理入口。'
                : selected === 'reporter'
                  ? '你的录入质量与积分；维护已授权比赛的信息。'
                  : '网站运营与赛事管理入口。'}
          </p>
          {selected === 'reporter' && <ReporterQualityPanel />}
          <div className="my-identity-actions">
            {selected === 'player' ? (
              <>
                {user.linkedPlayer && (
                  <button
                    data-profile-button
                    className="profile-button profile-button--outline"
                    onClick={() => open(openPlayer(user.linkedPlayer!.id, tournamentId))}
                  >
                    查看球员档案
                  </button>
                )}
                {user.linkedPlayer && (
                  <button
                    data-profile-button
                    className="profile-button profile-button--primary"
                    onClick={() => setEditing('player')}
                  >
                    管理球员资料
                  </button>
                )}
                {isCaptain && (
                  <button
                    data-profile-button
                    className={`profile-button ${user.linkedPlayer ? 'profile-button--outline' : 'profile-button--primary'}`}
                    onClick={onTeam}
                  >
                    管理球队
                  </button>
                )}
              </>
            ) : selected === 'coach' ? (
              <>
                <button
                  data-profile-button
                  className="profile-button profile-button--outline"
                  onClick={() => open(openPerson(user.id, tournamentId, 'coach'))}
                >
                  查看教练资料
                </button>
                <button
                  data-profile-button
                  className="profile-button profile-button--primary"
                  onClick={() => setEditing('coach')}
                >
                  编辑教练资料
                </button>
                <button
                  data-profile-button
                  className="profile-button profile-button--outline"
                  onClick={onTeam}
                >
                  管理球队
                </button>
              </>
            ) : selected === 'reporter' ? (
              <button
                data-profile-button
                className="profile-button profile-button--primary"
                onClick={onInformation}
              >
                编辑比赛信息与查看记录
              </button>
            ) : (
              <button
                data-profile-button
                className="profile-button profile-button--primary"
                onClick={() => open(identityEntryActions.administrationEntry())}
              >
                进入管理中心
              </button>
            )}
          </div>
        </div>
      )}
      <div className="my-identity-footer">
        <button data-profile-button onClick={onMatch}>
          自动匹配
        </button>
        <button data-profile-button onClick={onManage}>
          管理展示身份 →
        </button>
      </div>
      {editing === 'player' && (
        <SelfPlayerEditor
          onClose={() => setEditing(null)}
          onSaved={() =>
            window.dispatchEvent(
              new CustomEvent('xiaoqiu:player-profile:changed', { detail: user.linkedPlayer?.id }),
            )
          }
        />
      )}
      {editing === 'coach' && (
        <SelfPersonEditor
          onClose={() => setEditing(null)}
          onChanged={() => {
            void productRepository
              .getMe()
              .then(onUserChange)
              .catch(() => undefined)
          }}
        />
      )}
    </ProfileDialog>
  )
}
