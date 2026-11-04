import type { TeamSummary } from '../../features/product/product.types'

type TeamPaletteSource = Pick<
  TeamSummary,
  'teamCode' | 'crestUrl' | 'primaryColor' | 'secondaryColor'
>

// Match the existing DEMO_FIXTURE crest mapping in demo-media.ts and sources.json.
// Custom crests always use the team's declared colors instead of these visual samples.
const demoCrestColors: Record<string, readonly [string, string]> = {
  // 华中师范大学物理科学与技术学院 logo teal (sampled) + a light tint of it, for both 物院 teams.
  'DEMO-PHY-1': ['#036972', '#8ebcc0'],
  'DEMO-PHY-2': ['#036972', '#8ebcc0'],
  'DEMO-MATH': ['#c8102e', '#00a398'], // Liverpool
  'DEMO-CS': ['#ef0107', '#b89a57'], // Arsenal
  'DEMO-CHEM': ['#034694', '#e9bc3d'], // Chelsea
  'DEMO-BIO': ['#132257', '#c5ccd8'], // Tottenham
  'DEMO-GEO': ['#292b2c', '#deb86a'], // Newcastle
  'DEMO-EDU': ['#670e36', '#95bfe5'], // Aston Villa
  'DEMO-LIT': ['#003399', '#e2e9f2'], // Everton
  'DEMO-HIS': ['#242628', '#cc172b'], // Fulham
  'DEMO-ECON': ['#fdb913', '#25272b'], // Wolves
  'DEMO-FL': ['#e30613', '#373b40'], // Brentford
  'DEMO-LAW': ['#0057b8', '#e8edf4'], // Brighton
  'DEMO-JOUR': ['#1b458f', '#c41230'], // Crystal Palace
  'DEMO-MUSIC': ['#e53233', '#ecebe4'], // Nottingham Forest
  'DEMO-ART': ['#b50e12', '#292a2d'], // Bournemouth
}

function hexColor(value: string | null | undefined, fallback: string): string {
  if (!value || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value.trim())) return fallback
  const color = value.trim().toLowerCase()
  return color.length === 4
    ? `#${color
        .slice(1)
        .split('')
        .map((channel) => channel + channel)
        .join('')}`
    : color
}

function mixColor(color: string, target: string, amount: number): string {
  const channels = [1, 3, 5].map((offset) => {
    const start = parseInt(color.slice(offset, offset + 2), 16)
    const end = parseInt(target.slice(offset, offset + 2), 16)
    return Math.round(start + (end - start) * amount)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

export function getTeamNavPalette(team?: TeamPaletteSource | null) {
  const usesDemoCrest =
    team && (!team.crestUrl || team.crestUrl.includes('/api/media/demo/crests/'))
  const sample = usesDemoCrest ? demoCrestColors[team.teamCode] : undefined
  const primary = sample?.[0] ?? hexColor(team?.primaryColor, '#244f3c')
  const secondary = sample?.[1] ?? hexColor(team?.secondaryColor, '#c6a760')

  return {
    primary,
    secondary,
    primaryLight: mixColor(primary, '#fffaf0', 0.25),
    primaryDark: mixColor(primary, '#141419', 0.28),
    secondaryLight: mixColor(secondary, '#fffaf0', 0.32),
    secondaryDark: mixColor(secondary, '#141419', 0.18),
  }
}

export function getTeamNavOrnamentPalette(team?: TeamPaletteSource | null) {
  const colors = getTeamNavPalette(team)
  return {
    primary: mixColor(colors.primary, '#f7f1e6', 0.38),
    primaryDark: mixColor(colors.primary, '#f7f1e6', 0.28),
    primaryLight: mixColor(colors.primary, '#fffaf0', 0.62),
    secondary: mixColor(colors.secondary, '#f7f1e6', 0.32),
    secondaryDark: mixColor(colors.secondary, '#f7f1e6', 0.22),
    secondaryLight: mixColor(colors.secondary, '#fffaf0', 0.66),
  }
}

export function getTeamNavOrnamentColor(team?: TeamPaletteSource | null): string {
  const palette = getTeamNavPalette(team)
  const channels = [1, 3, 5].map((offset) =>
    parseInt(palette.primary.slice(offset, offset + 2), 16),
  )
  const anchor = channels.every((channel) => channel > 225) ? palette.secondary : palette.primary
  return mixColor(anchor, '#f7f1e6', 0.28)
}
