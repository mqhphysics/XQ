import { Button, Image, Text, View } from '@tarojs/components'
import { useNativeIndicator } from '../../features/native-navigation/index.weapp'
import type { TeamSummary } from '../../features/product/product.types'
import { TeamCrest } from '../product-ui'
import unselectedTeamIcon from '../../assets/navigation/unselected-team.svg'
import { NativeTeamTabFocus } from './team-tab-focus'
import './native-wide-nav.weapp.scss'

export type NativeWideNavItem = { key: string; label: string }

/** Website desktop nav geometry (public-shell/index.scss, 721–1040px): slot · team slot · gap. */
function geometry(windowWidth: number) {
  return windowWidth < 720 ? { slot: 52, team: 84, gap: 4 } : { slot: 55, team: 104, gap: 8 }
}
function slotCentre(index: number, g: ReturnType<typeof geometry>) {
  const widths = [g.slot, g.slot, g.team, g.slot, g.slot]
  let x = 0
  for (let i = 0; i < index; i++) x += (widths[i] ?? g.slot) + g.gap
  return x + (widths[index] ?? g.slot) / 2
}
/** Centre of a fractional pager position, so the underline follows a swipe between sections. */
function centreAt(position: number, g: ReturnType<typeof geometry>) {
  const clamped = Math.max(0, Math.min(4, position)),
    low = Math.floor(clamped),
    high = Math.min(4, low + 1),
    t = clamped - low
  return slotCentre(low, g) * (1 - t) + slotCentre(high, g) * t
}

/**
 * Wide-window (foldable / tablet / PC) top navigation, drawn like the website's desktop header:
 * icon above label, the primary team crest in the middle with its 花纹, and a short underline.
 */
export function NativeWideNav({
  items,
  active,
  primaryTeam,
  teamReplay,
  windowWidth,
  onSelect,
}: {
  items: NativeWideNavItem[]
  active: string
  primaryTeam: TeamSummary | null
  teamReplay: number
  windowWidth: number
  onSelect: (key: string) => void
}) {
  const frame = useNativeIndicator()
  const g = geometry(windowWidth)
  const width = 4 * g.slot + g.team + 4 * g.gap
  const teamDistance = Math.min(1, Math.abs(frame.index - 2))
  return (
    <View
      id="native-guide-wide-nav"
      className={`native-wide-nav${windowWidth < 720 ? ' native-wide-nav--compact' : ''}`}
      style={`width:${width}px;gap:${g.gap}px;`}
    >
      <View
        aria-hidden="true"
        className="native-wide-nav__line"
        style={`transform:translateX(${centreAt(frame.index, g) - 14.5}px);opacity:${teamDistance};transition-duration:${frame.duration}ms;`}
      />
      {items.map((item) =>
        item.key === 'team' ? (
          <Button
            key={item.key}
            id="native-guide-nav-team"
            hoverClass="native-press"
            hoverStartTime={0}
            hoverStayTime={60}
            aria-label={primaryTeam ? `打开${primaryTeam.name}` : '打开主队'}
            aria-current={active === 'team' ? 'page' : ''}
            className={`native-wide-nav__team${active === 'team' ? ' is-active' : ''}`}
            style={`width:${g.team}px;flex-basis:${g.team}px;`}
            onClick={() => onSelect(item.key)}
          >
            {active === 'team' && <NativeTeamTabFocus key={teamReplay} team={primaryTeam} />}
            <View className="native-wide-nav__crest">
              {primaryTeam ? (
                <TeamCrest team={primaryTeam} size="medium" eager interactive={false} />
              ) : (
                <Image
                  className="native-wide-nav__crest-empty"
                  src={unselectedTeamIcon}
                  mode="aspectFit"
                />
              )}
            </View>
          </Button>
        ) : (
          <Button
            key={item.key}
            id={`native-guide-nav-${item.key}`}
            hoverClass="native-press"
            hoverStartTime={0}
            hoverStayTime={60}
            aria-current={active === item.key ? 'page' : ''}
            className={`native-wide-nav__item${active === item.key ? ' is-active' : ''}`}
            style={`width:${g.slot}px;flex-basis:${g.slot}px;`}
            onClick={() => onSelect(item.key)}
          >
            <View
              aria-hidden="true"
              className={`native-wide-nav__icon native-wide-nav__icon--${item.key}`}
            />
            <Text className="native-wide-nav__label">{item.label}</Text>
          </Button>
        ),
      )}
    </View>
  )
}
