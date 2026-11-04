import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { campusRepository, type CampusProfile } from '../../features/campus/campus.repository.h5'
import { readSession } from '../../features/product/session'
import { productRepository } from '../../features/product/product.repository'
import { identityEntryActions } from '../../features/identity/entry-actions.h5'
import { useOverlayFocus } from '../overlay-focus'
import brandMark from '../../assets/home-visual/brand-mark.png'
import { WELCOME_COPY, computeFlight, splitQuoted, type WelcomeIcon } from './welcome.logic.h5'

/** Accounts whose welcome card was dismissed in this tab, so it never flashes back before the server confirms. */
const welcomed = new Set<string>()
/** Player-match prompts postponed in this tab (version B keeps its existing behaviour). */
const skipped = new Set<string>()
const ANNOUNCEMENT_TARGET = '.notice-rail--line .notice-rail__label'

export function CampusWelcome() {
  const token = readSession()?.accessToken,
    id = readSession()?.user.id
  const [profile, setProfile] = useState<CampusProfile | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    let current = true
    setProfile(null)
    if (token && id && !skipped.has(id))
      campusRepository
        .me()
        .then((value) => {
          if (current) setProfile(value)
        })
        .catch(() => {})
    return () => {
      current = false
    }
  }, [token, id])
  // 'open' keeps the card mounted through its exit animation even after the profile refreshes.
  const [welcome, setWelcome] = useState<'idle' | 'open' | 'done'>('idle')
  useEffect(() => {
    if (profile && !profile.onboardingCompletedAt && id && !welcomed.has(id) && welcome === 'idle')
      setWelcome('open')
  }, [profile, id, welcome])
  const candidate =
    welcome !== 'open' && profile?.onboardingCompletedAt && !profile.playerOfferDismissedAt
      ? profile.playerCandidate
      : null

  function finishWelcome() {
    if (!id) return
    welcomed.add(id)
    // Persist first-visit completion on the server; the welcome never returns for this account.
    void campusRepository
      .onboarding('TUTORIAL_COMPLETE')
      .catch(() => campusRepository.onboarding('TUTORIAL_COMPLETE'))
      .then(() => campusRepository.me())
      .then((value) => setProfile(value))
      .catch(() => setProfile(null))
  }

  if (welcome === 'open')
    return <WelcomeCard onDismiss={finishWelcome} onGone={() => setWelcome('done')} />
  if (!candidate) return null
  return (
    <PlayerCandidatePrompt
      profile={profile!}
      candidate={candidate}
      busy={busy}
      error={error}
      onClose={() => {
        if (id) skipped.add(id)
        setProfile(null)
      }}
      onSave={async (action) => {
        if (busy) return
        setBusy(true)
        setError('')
        try {
          await campusRepository.onboarding(action, candidate.id)
          if (action === 'CONFIRM_PLAYER') {
            const user = await productRepository.getMe()
            window.dispatchEvent(new CustomEvent('xiaoqiu:identity:changed', { detail: user }))
          }
          setProfile(await campusRepository.me())
        } catch (issue) {
          setError(issue instanceof Error ? issue.message : '保存失败，请重试')
        } finally {
          setBusy(false)
        }
      }}
    />
  )
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** One-page welcome: no buttons; any click, Esc or Enter sends it into the announcement bar. */
function WelcomeCard({ onDismiss, onGone }: { onDismiss: () => void; onGone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const backdrop = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLElement>(null)
  const leavingRef = useRef(false)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const [gone, setGoneState] = useState(false)
  const onGoneRef = useRef(onGone)
  onGoneRef.current = onGone
  const setGone = (value: boolean) => {
    setGoneState(value)
    if (value) onGoneRef.current()
  }

  function dismiss() {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    onDismissRef.current()
    const panel = card.current,
      shade = backdrop.current
    if (!panel || !shade || typeof panel.animate !== 'function') {
      setGone(true)
      return
    }
    // Freeze the entrance animation where it is so the exit starts from the visible state.
    panel.getAnimations().forEach((animation) => animation.finish())
    const reduced = prefersReducedMotion()
    const fade = shade.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduced ? 200 : 520,
      delay: reduced ? 0 : 140,
      easing: 'ease-in',
      fill: 'forwards',
    })
    if (reduced) {
      panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
      fade.onfinish = () => setGone(true)
      return
    }
    const rect = panel.getBoundingClientRect()
    const targetElement = document.querySelector<HTMLElement>(ANNOUNCEMENT_TARGET)
    const target = targetElement?.getBoundingClientRect() ?? null
    const flight = computeFlight(rect, target, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    const { dx, dy, scale } = flight
    const flyAnimation = panel.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
        {
          transform: `translate(${dx * 0.04}px, ${dy * 0.04 - 6}px) scale(0.97)`,
          opacity: 1,
          offset: 0.18,
        },
        {
          transform: `translate(${dx * 0.55}px, ${dy * 0.5}px) scale(${(0.97 + scale) / 2.6})`,
          opacity: 1,
          offset: 0.6,
        },
        {
          transform: `translate(${dx * 0.92}px, ${dy * 0.92}px) scale(${scale * 1.6})`,
          opacity: 0.85,
          offset: 0.9,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0, offset: 1 },
      ],
      { duration: 720, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' },
    )
    flyAnimation.onfinish = () => {
      setGone(true)
      if (flight.toTarget && targetElement?.animate)
        targetElement.animate(
          [
            { transform: 'scale(1)', filter: 'brightness(1)' },
            { transform: 'scale(1.06)', filter: 'brightness(1.12)', offset: 0.35 },
            { transform: 'scale(1)', filter: 'brightness(1)' },
          ],
          { duration: 520, easing: 'ease-out' },
        )
    }
  }
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss

  // Scroll lock and Tab containment; keys are handled below so Enter never reaches the page.
  useOverlayFocus(!gone, '.campus-welcome-card', () => dismissRef.current())
  useEffect(() => {
    const timer = window.setTimeout(() => card.current?.focus({ preventScroll: true }), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      event.stopPropagation()
      dismissRef.current()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  if (gone) return null
  return createPortal(
    <div
      ref={backdrop}
      className={`campus-welcome-backdrop${leaving ? ' is-leaving' : ''}`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        dismiss()
      }}
    >
      <section
        ref={card}
        className="campus-welcome-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campus-welcome-title"
        aria-describedby="campus-welcome-hint"
        tabIndex={-1}
      >
        <header className="campus-welcome-card__header">
          <span className="campus-welcome-card__mark" aria-hidden="true">
            <img src={brandMark} alt="" />
          </span>
          <h2 id="campus-welcome-title">{WELCOME_COPY.title}</h2>
          <p className="campus-welcome-card__subtitle">{WELCOME_COPY.subtitle}</p>
        </header>
        <ul className="campus-welcome-card__list">
          {WELCOME_COPY.bullets.map((bullet, index) => (
            <li key={bullet.icon} style={{ animationDelay: `${180 + index * 60}ms` }}>
              <span className="campus-welcome-card__icon" aria-hidden="true">
                <WelcomeGlyph icon={bullet.icon} />
              </span>
              <span className="campus-welcome-card__text">
                {splitQuoted(bullet.text).map((part, partIndex) =>
                  part.quoted ? (
                    <b key={partIndex}>{part.text}</b>
                  ) : (
                    <span key={partIndex}>{part.text}</span>
                  ),
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="campus-welcome-card__footer">
          <i aria-hidden="true" />
          {WELCOME_COPY.footer}
        </p>
        <p id="campus-welcome-hint" className="campus-welcome-card__hint">
          {WELCOME_COPY.hint}
        </p>
      </section>
    </div>,
    document.body,
  )
}

function WelcomeGlyph({ icon }: { icon: WelcomeIcon }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (icon === 'schedule')
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M8 3v4M16 3v4M3.5 10h17M8 14h3M8 17h6" />
      </svg>
    )
  if (icon === 'team')
    return (
      <svg {...common}>
        <path d="M12 3.5l7 2.6v5.2c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V6.1z" />
        <path d="M9 12l2.1 2.1L15.5 9.8" />
      </svg>
    )
  if (icon === 'camera')
    return (
      <svg {...common}>
        <path d="M4 8.5A2.5 2.5 0 016.5 6h1.7l1.4-2h4.8l1.4 2h1.7A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5z" />
        <circle cx="12" cy="12.5" r="3.4" />
      </svg>
    )
  return (
    <svg {...common}>
      <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6" />
      <path d="M10.5 18h3" />
      <path d="M9.6 9.8l1.7 1.7 3.2-3.3" />
    </svg>
  )
}

function PlayerCandidatePrompt({
  profile,
  candidate,
  busy,
  error,
  onClose,
  onSave,
}: {
  profile: CampusProfile
  candidate: NonNullable<CampusProfile['playerCandidate']>
  busy: boolean
  error: string
  onClose: () => void
  onSave: (action: 'DISMISS_PLAYER' | 'CONFIRM_PLAYER') => Promise<void>
}) {
  useOverlayFocus(true, '.campus-welcome', onClose)
  return createPortal(
    <div className="campus-modal-backdrop">
      <section
        className="campus-dialog campus-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campus-welcome-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="campus-eyebrow">找到你的球员档案</span>
            <h2 id="campus-welcome-title">这是你的球员身份吗？</h2>
          </div>
          <button
            data-campus-button
            className="campus-icon-button"
            type="button"
            aria-label="稍后查看"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="campus-welcome__identity">
          {candidate.portraitUrl && (
            <img
              src={
                candidate.portraitUrl.startsWith('/api/')
                  ? `${(process.env.TARO_APP_API_BASE_URL ?? '').replace(/\/api\/?$/, '')}${candidate.portraitUrl}`
                  : candidate.portraitUrl
              }
              alt="球员照片"
            />
          )}
          <div>
            <strong>{candidate.name}</strong>
            <p>
              {profile.studentRecord?.collegeName} · {profile.studentRecord?.academicYear}
            </p>
            <p>已与核验过的学生档案匹配。确认后，你可以查看和维护自己的球员资料。</p>
          </div>
        </div>
        {error && (
          <p className="campus-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button
            data-campus-button
            type="button"
            className="campus-secondary"
            disabled={busy}
            onClick={() => void onSave('DISMISS_PLAYER')}
          >
            稍后确认
          </button>
          <button
            data-campus-button
            type="button"
            disabled={busy}
            onClick={() => void onSave('CONFIRM_PLAYER')}
          >
            {busy ? '正在关联…' : '确认是我'}
          </button>
        </footer>
        <p className="campus-footnote">
          资料不符？
          <button
            data-campus-button
            type="button"
            onClick={() => {
              onClose()
              void identityEntryActions.identity()
            }}
          >
            申请核验
          </button>
        </p>
      </section>
    </div>,
    document.body,
  )
}
