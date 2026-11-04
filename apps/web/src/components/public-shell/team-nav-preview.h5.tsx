import { createPortal } from 'react-dom'

import type { TeamNavDesignKey } from './team-nav-designs.h5'

export const teamNavPreviewCrestKeys = ['united', 'city', 'liverpool', 'chelsea'] as const

export const teamNavPreviewCrests = {
  united: {
    label: '物院一队',
    teamCode: 'DEMO-PHY-1',
    crestUrl: '/api/media/demo/crests/01.png',
    primaryColor: null,
    secondaryColor: null,
  },
  city: {
    label: '物院二队',
    teamCode: 'DEMO-PHY-2',
    crestUrl: '/api/media/demo/crests/02.png',
    primaryColor: null,
    secondaryColor: null,
  },
  liverpool: {
    label: '利物浦',
    teamCode: 'DEMO-MATH',
    crestUrl: '/api/media/demo/crests/03.png',
    primaryColor: null,
    secondaryColor: null,
  },
  chelsea: {
    label: '切尔西',
    teamCode: 'DEMO-CHEM',
    crestUrl: '/api/media/demo/crests/05.png',
    primaryColor: null,
    secondaryColor: null,
  },
} as const

export interface TeamNavPreviewState {
  enabled: boolean
  design: TeamNavDesignKey
  crest: (typeof teamNavPreviewCrestKeys)[number]
}

export function readTeamNavPreview(): TeamNavPreviewState {
  const params = new URLSearchParams(window.location.search)
  const design = params.get('navDesign')
  return {
    enabled:
      window.location.hostname === '127.0.0.1' &&
      window.location.port === '3101' &&
      (design === '04' || design === '15'),
    design: '15',
    crest: teamNavPreviewCrestKeys.find((crest) => crest === params.get('navCrest')) ?? 'united',
  }
}

export function TeamNavPreviewControls({
  value,
  onChange,
  onReplay,
}: {
  value: TeamNavPreviewState
  onChange: (value: TeamNavPreviewState) => void
  onReplay: () => void
}) {
  if (!value.enabled) return null
  const update = (next: TeamNavPreviewState) => {
    const url = new URL(window.location.href)
    url.searchParams.set('navDesign', next.design)
    url.searchParams.set('navCrest', next.crest)
    window.history.replaceState(window.history.state, '', url)
    onChange(next)
  }
  return createPortal(
    <div
      className="team-nav-preview"
      aria-label="队徽图案对比"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="team-nav-preview__title">15 · 单色线绘卷草</div>
      <div className="team-nav-preview__choices" aria-label="示例队徽">
        {teamNavPreviewCrestKeys.map((crest) => (
          <button
            type="button"
            key={crest}
            aria-pressed={value.crest === crest}
            onClick={() => update({ ...value, crest })}
          >
            {teamNavPreviewCrests[crest].label}
          </button>
        ))}
      </div>
      <div className="team-nav-preview__choices">
        <button type="button" onClick={onReplay}>
          播放生长
        </button>
      </div>
      <div className="team-nav-preview__note">队徽为对比试样，不改变账号主队</div>
    </div>,
    document.body,
  )
}
