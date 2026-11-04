
import { SelfPersonEditor } from './self-editor.h5'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PersonRequest, PersonHoverRequest } from '../../features/product/person-navigation.h5'
import { openPerson } from '../../features/product/person-navigation.h5'
import { productRepository } from '../../features/product/product.repository'
import { readSession } from '../../features/product/session'
import type { PublicPersonResponse } from '../../features/product/product.types'
import { identityBadgeKinds, identityLabels } from '../../features/product/identity-badges'
import { PostCard, UserAvatar } from '../product-ui'
import { PersonHoverPreview } from '../player-overlay/index.h5'
import { personalBackgroundUrl } from '../../features/managed-media/backgrounds.h5'
import { openPlayer } from '../../features/product/player-navigation.h5'
import { TextDisclosure } from '../interactions/text-disclosure.h5'
import { VerificationBadge } from '../verification-badge/index.h5'
import { useOverlayFocus } from '../overlay-focus'

import { PostIcon } from '../post-social/icons'
import './index.h5.scss'
import { useHoverPosition } from '../player-overlay/hover-position.h5'

const pending = new Map<string, Promise<PublicPersonResponse>>()
function usePerson(request: PersonRequest) {
  const [person, setPerson] = useState<PublicPersonResponse | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    setPerson(null)
    setError('')
    const key = JSON.stringify([request.userId, request.tournamentId, readSession()?.user.id])
    let read = pending.get(key)
    if (!read) {
      read = productRepository
        .getPerson(request.userId, request.tournamentId)
        .finally(() => pending.delete(key))
      pending.set(key, read)
    }
    void read
      .then((data) => {
        if (active) setPerson(data)
      })
      .catch((issue) => {
        if (active) setError(issue instanceof Error ? issue.message : '人物资料读取失败')
      })
    return () => {
      active = false
    }
  }, [request.userId, request.tournamentId, reload])
  return { person, error, retry: () => setReload((value) => value + 1) }
}
function ReadState({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="player-read-state" role={error ? 'alert' : 'status'}>
      <h2>{error ? '人物资料暂时不可用' : '正在读取人物资料'}</h2>
      {error && (
        <>
          <p>{error}</p>
          <button type="button" className="player-button" onClick={retry}>
            重新加载
          </button>
        </>
      )}
    </div>
  )
}
function MessageAction(_props: { person: PublicPersonResponse }) {
  
  return (
    null
  )
}
export function PersonDialog({
  request,
  onClose,
}: {
  request: PersonRequest
  onClose: () => void
}) {
  const { person, error, retry } = usePerson(request)
  const [editing, setEditing] = useState(false)
  useOverlayFocus(true, '.person-dialog', onClose)
  return createPortal(
    <div
      className="player-scrim person-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="player-dialog person-dialog xq-dialog xq-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label="用户资料"
        tabIndex={-1}
      >
        <header className="xq-dialog__header">
          <div>
            <h2>用户资料</h2>
          </div>
          <button
            type="button"
            className="player-dialog__close"
            aria-label="关闭人物资料"
            onClick={onClose}
          >
            <PostIcon name="close" />
          </button>
        </header>
        <div className="xq-dialog__body">
          {person ? (
            <>
              <header className="person-hero">
                <img
                  className="person-hero__cover"
                  src={personalBackgroundUrl(person.coverUrl)}
                  alt=""
                />
                <UserAvatar name={person.displayName} avatarUrl={person.avatarUrl} size="large" />
                <div>
                  <div className="person-hero__name">
                    <h1>{person.displayName}</h1>
                    <VerificationBadge
                      level={person.verificationLevel}
                      roles={person.roles}
                      official={person.official}
                      displayedKind={person.displayedBadgeKind}
                      userId={person.id}
                    />
                  </div>
                  <TextDisclosure className="person-bio" lines={3}>
                    {person.bio || '还没有填写个人简介。'}
                  </TextDisclosure>
                  {person.organizationName && <span>{person.organizationName}</span>}
                </div>
                <div className="person-hero__actions">
                  {person.player && person.showPlayerIdentity !== false && (
                    <button
                      type="button"
                      className="player-button player-button--secondary person-player-link"
                      title={`${person.player.displayName} · 查看球员档案`}
                      onClick={() => void openPlayer(person.player!.id, person.tournamentId)}
                    >
                      球员身份
                    </button>
                  )}
                  <MessageAction person={person} />
                </div>
              </header>
              {readSession()?.user.id === person.id && (
                <button
                  type="button"
                  className="own-profile-edit-button"
                  onClick={() => setEditing(true)}
                >
                  编辑个人信息
                </button>
              )}
              <div className="person-content">
                <div className="person-selection">动态与资料</div>
                <div className="player-profile-grid">
                  <section className="player-panel">
                    <div className="player-panel__head">
                      <h2>公开动态</h2>
                      <span>校园社区</span>
                    </div>
                    {person.posts.length ? (
                      person.posts.map((post) => (
                        <PostCard
                          key={post.id}
                          post={post}
                          onOpen={() => {}}
                          onLike={() => void productRepository.setLike(post.id, !post.likedByMe)}
                        />
                      ))
                    ) : (
                      <div className="player-section-empty">
                        <strong>还没有公开动态</strong>
                      </div>
                    )}
                  </section>
                  <section className="player-panel">
                    <div className="player-panel__head">
                      <h2>个人资料</h2>
                    </div>
                    <dl className="player-facts">
                      <div>
                        <dt>昵称</dt>
                        <dd>{person.displayName}</dd>
                      </div>
                      <div>
                        <dt>身份</dt>
                        <dd>
                          {identityBadgeKinds(
                            person.verificationLevel,
                            person.roles,
                            person.official,
                          )
                            .map((kind) => identityLabels[kind])
                            .join('、') || '普通用户'}
                        </dd>
                      </div>
                    </dl>
                    <p className="person-bio">{person.bio || '还没有填写个人简介。'}</p>
                  </section>
                </div>
              </div>
            </>
          ) : (
            <ReadState error={error} retry={retry} />
          )}
        </div>
      </section>
      {editing && (
        <SelfPersonEditor onClose={() => setEditing(false)} onChanged={() => void retry()} />
      )}
    </div>,
    document.body,
  )
}
export function PersonHoverCard({
  request,
  onEnter,
  onLeave,
  onClose,
}: {
  request: PersonHoverRequest
  onEnter: () => void
  onLeave: () => void
  onClose: () => void
}) {
  const { person, error, retry } = usePerson(request)
  const position = useHoverPosition(request.anchor)
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      }
    }
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest('.person-hover-card') &&
        !request.anchor.contains(event.target)
      )
        onClose()
    }
    document.addEventListener('keydown', escape, true)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', escape, true)
      document.removeEventListener('pointerdown', outside)
    }
  }, [onClose, request.anchor])
  return createPortal(
    <aside
      className="player-hover-card person-hover-card"
      ref={position.ref}
      aria-label="人物信息预览"
      style={position.style}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onLeave()
      }}
    >
      <div className="player-hover-card__cover">
        <img src={personalBackgroundUrl(person?.coverUrl)} alt="" />
      </div>
      {person ? (
        <PersonHoverPreview
          name={person.displayName}
          avatarUrl={person.avatarUrl}
          meta={person.bio || person.organizationName || '校园社区成员'}
          verificationLevel={person.verificationLevel}
          roles={person.roles}
          official={person.official}
          displayedKind={person.displayedBadgeKind}
          userId={person.id}
          onOpen={() => void openPerson(person.id, person.tournamentId)}
          actions={
            <div className="player-actions">
              <button
                type="button"
                className="player-button"
                onClick={() => void openPerson(person.id, person.tournamentId)}
              >
                查看资料
              </button>
              <MessageAction person={person} />
            </div>
          }
        />
      ) : (
        <ReadState error={error} retry={retry} />
      )}
    </aside>,
    document.body,
  )
}
