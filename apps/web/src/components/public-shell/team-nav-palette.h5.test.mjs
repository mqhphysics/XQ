import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getTeamNavOrnamentColor,
  getTeamNavOrnamentPalette,
  getTeamNavPalette,
} from './team-nav-palette.h5.ts'

const team = {
  teamCode: 'DEMO-PHY-1',
  crestUrl: '/api/media/demo/crests/01.png',
  primaryColor: '#1f6b45',
  secondaryColor: '#f4c95d',
}

test('物院 crests use the college logo teal rather than old fixture colors', () => {
  const palette = getTeamNavPalette(team)
  assert.equal(palette.primary, '#036972')
  assert.equal(palette.secondary, '#8ebcc0')
})

test('ornaments retain the club hues while being lighter than the crest colors', () => {
  for (const teamCode of ['DEMO-PHY-1', 'DEMO-PHY-2']) {
    const source = { ...team, teamCode }
    const crest = getTeamNavPalette(source)
    const ornament = getTeamNavOrnamentPalette(source)
    const brightness = (color) =>
      [1, 3, 5].reduce((total, offset) => total + parseInt(color.slice(offset, offset + 2), 16), 0)
    assert.notEqual(ornament.primary, crest.primary)
    assert.notEqual(ornament.secondary, crest.secondary)
    assert.ok(brightness(ornament.primary) > brightness(crest.primary))
    assert.ok(brightness(ornament.secondary) > brightness(crest.secondary))
  }
})

test('custom crests keep their declared team colors even on a known demo team code', () => {
  const palette = getTeamNavPalette({ ...team, crestUrl: '/api/media/uploads/custom-crest.png' })
  assert.equal(palette.primary, team.primaryColor)
  assert.equal(palette.secondary, team.secondaryColor)
})

test('missing demo crest uses the same team-code fallback as TeamCrest', () => {
  assert.deepEqual(getTeamNavPalette({ ...team, crestUrl: null }), getTeamNavPalette(team))
})

test('team changes produce a new palette without retaining the previous club colors', () => {
  const city = getTeamNavPalette({
    ...team,
    teamCode: 'DEMO-PHY-2',
    crestUrl: '/api/media/demo/crests/02.png',
  })
  assert.equal(city.primary, '#036972')
  const liverpool = getTeamNavPalette({
    ...team,
    teamCode: 'DEMO-MATH',
    crestUrl: '/api/media/demo/crests/03.png',
  })
  assert.notEqual(liverpool.primary, city.primary)
  assert.equal(getTeamNavPalette(null).primary, '#244f3c')
})

test('custom shorthand colors are normalized and invalid values fall back safely', () => {
  const palette = getTeamNavPalette({
    ...team,
    teamCode: 'CUSTOM',
    primaryColor: ' #F00 ',
    secondaryColor: 'invalid',
  })
  assert.equal(palette.primary, '#ff0000')
  assert.equal(palette.secondary, '#c6a760')
  for (const color of Object.values(palette)) assert.match(color, /^#[a-f\d]{6}$/)
})

test('light team colors retain a visible shaded edge rather than disappearing into white', () => {
  const palette = getTeamNavPalette({
    ...team,
    teamCode: 'CUSTOM',
    primaryColor: '#fff',
    secondaryColor: '#fff',
  })
  assert.notEqual(palette.primaryDark, palette.primary)
  assert.notEqual(palette.secondaryDark, palette.secondary)
})

test('monochrome ornaments follow the visible club primary color and change with the team', () => {
  const colors = ['DEMO-PHY-1', 'DEMO-MATH', 'DEMO-CHEM', 'DEMO-CS'].map((teamCode) =>
    getTeamNavOrnamentColor({ ...team, teamCode }),
  )
  assert.equal(new Set(colors).size, 4)
  for (const color of colors) assert.match(color, /^#[a-f\d]{6}$/)
  // Both 物院 teams share the college crest, so they share its teal ornament.
  assert.equal(
    getTeamNavOrnamentColor({ ...team, teamCode: 'DEMO-PHY-2' }),
    getTeamNavOrnamentColor(team),
  )
  const teal = getTeamNavOrnamentColor(team)
  const rgb = [1, 3, 5].map((offset) => parseInt(teal.slice(offset, offset + 2), 16))
  assert.ok(rgb[1] > rgb[0] && rgb[2] > rgb[0])
  const red = getTeamNavOrnamentColor({ ...team, teamCode: 'DEMO-MATH' })
  const redRgb = [1, 3, 5].map((offset) => parseInt(red.slice(offset, offset + 2), 16))
  assert.ok(redRgb[0] > redRgb[1] && redRgb[0] > redRgb[2])
})

test('white primary colors use the declared accent and custom crests do not get a demo tint', () => {
  const custom = {
    ...team,
    crestUrl: '/api/media/crests/custom.png',
    primaryColor: '#ffffff',
    secondaryColor: '#0033aa',
  }
  const color = getTeamNavOrnamentColor(custom)
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
  assert.ok(rgb[2] > rgb[0])
  assert.notEqual(color, getTeamNavOrnamentColor(team))
})
