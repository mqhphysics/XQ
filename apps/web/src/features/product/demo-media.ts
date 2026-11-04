const demoTeamCodes = [
  'DEMO-PHY-1',
  'DEMO-PHY-2',
  'DEMO-MATH',
  'DEMO-CS',
  'DEMO-CHEM',
  'DEMO-BIO',
  'DEMO-GEO',
  'DEMO-EDU',
  'DEMO-LIT',
  'DEMO-HIS',
  'DEMO-ECON',
  'DEMO-FL',
  'DEMO-LAW',
  'DEMO-JOUR',
  'DEMO-MUSIC',
  'DEMO-ART',
]

export function demoCrestUrl(teamCode: string): string | null {
  const index = demoTeamCodes.indexOf(teamCode)
  return index < 0
    ? null
    : `/api/media/demo/crests/${String(index + 1).padStart(2, '0')}.png?v=club-20261018`
}
