import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
const require = createRequire(import.meta.url)
function moduleAt(relative, deps) {
  const module = { exports: {} },
    code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) =>
      name === 'react/jsx-runtime'
        ? jsx
        : name === '@tarojs/components'
          ? { Button: 'Button', ScrollView: 'ScrollView', View: 'View', Text: 'Text' }
          : name.endsWith('.scss')
            ? {}
            : deps[name],
  })
  return module.exports
}
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
test('row board: seven players on top, full/精简 rows, recent strip, persisted mode and substitution', () => {
  const state = [],
    writes = [],
    storage = new Map()
  let cursor = 0
  const roster = (prefix, count) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${prefix}${index + 1}`,
      shirtNumber: String(index + 1),
      displayName: `${prefix}球员${index + 1}`,
      avatarUrl: null,
      starter: null,
    }))
  const workspace = {
    matchId: 'match',
    canRecord: true,
    teams: [
      { id: 'a', name: '球队甲', shortName: '甲', players: roster('a', 9) },
      { id: 'b', name: '球队乙', shortName: '乙', players: roster('b', 3) },
    ],
    operations: [],
  }
  const logic = moduleAt('./board.logic.weapp.ts', {})
  const { NativeTechnicalBoard } = moduleAt('./board.weapp.tsx', {
    react: {
      useState: (initial) => {
        const index = cursor++
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
        return [
          state[index],
          (value) => {
            state[index] = typeof value === 'function' ? value(state[index]) : value
          },
        ]
      },
      useRef: (current) => ({ current }),
      useMemo: (factory) => factory(),
      useEffect() {},
      useContext: () => null,
    },
    '@tarojs/taro': {
      default: {
        getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
        getStorageSync: (key) => storage.get(key) ?? '',
        setStorageSync: (key, value) => storage.set(key, value),
        vibrateShort: async () => {},
        showToast: async () => {},
      },
    },
    '../../components/native-ui/index.weapp': { NativeDialog: 'Dialog' },
    '../../components/native-ui/match-lineups.weapp': { NativePlayerPortrait: 'Portrait' },
    './lineup-sort.weapp': { NativeLineupSort: 'LineupSort' },
    '../readonly-match/clock.weapp': { NativeMatchClock: 'Clock' },
    './corner-icon.weapp': { NativeCornerIcon: 'CornerIcon' },
    '../product/session': { readSession: () => ({ user: { id: 'user', organizationId: 'org' } }) },
    '../native-navigation/index.weapp': { nativeBack: async () => {} },
    '../native-navigation/detail-context.weapp': {
      NativeDetailEntryContext: {},
      nativeDetailScrollLockEvent: 'lock',
    },
    '../../components/native-ui/preferences.weapp': {
      useNativePreferences: () => ({ reduceMotion: false }),
    },
    './repository.weapp': {
      ...require('@xiaoqiu/contracts'),
      technicalId: () => String(writes.length + 1),
    },
    './board.logic.weapp': logic,
  })
  const render = () => {
    cursor = 0
    return NativeTechnicalBoard({
      recorder: {
        workspace,
        error: '',
        busy: false,
        unsynced: 0,
        append: (op) => {
          writes.push(op)
          workspace.operations = [...workspace.operations, op]
          return true
        },
      },
      onMode() {},
    })
  }
  const keys = (tree) =>
    nodes(tree).filter((node) => node.props?.className?.startsWith('native-record-key '))
  const players = (tree) =>
    nodes(tree).filter((node) => String(node.props?.id || '').startsWith('record-player-'))
  let tree = render()
  assert.equal(keys(tree).length, 14)
  assert.deepEqual(
    players(tree).map((node) => node.props.id),
    ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'].map((id) => 'record-player-' + id),
  )
  // Every player shows a centred portrait plus the shirt number outside the circle.
  for (const node of players(tree)) {
    assert.ok(nodes(node).some((child) => child.type === 'Portrait'))
    assert.ok(
      nodes(node).some((child) => child.props?.className === 'native-record-player__number'),
    )
  }
  players(tree)[0].props.onClick()
  tree = render()
  assert.equal(
    nodes(tree).filter((node) => node.props?.className === 'native-record-team is-player').length,
    1,
  )
  keys(tree).at(-2).props.onClick()
  assert.equal(writes[0].playerId, 'a1')
  assert.equal(writes[0].metric, 'PASS')
  tree = render()
  const recent = nodes(tree).find((node) => node.props?.className === 'native-record-recent')
  assert.match(JSON.stringify(recent.props.children), /1 a球员1 · 传球✓/)
  // Corners always count for the selected team, even with an individual player selected.
  nodes(tree)
    .find((node) => node.props?.className === 'native-record-corner')
    .props.onClick()
  assert.equal(writes.at(-1).metric, 'CORNER')
  assert.equal(writes.at(-1).playerId, null)
  assert.equal(writes.at(-1).teamId, 'a')
  tree = render()
  assert.match(
    JSON.stringify(
      nodes(tree).find((node) => node.props?.className === 'native-record-corner').props.children,
    ),
    /全队.*1/,
  )
  nodes(tree)
    .find((node) => node.props?.className === 'native-record-undo')
    .props.onClick()
  tree = render()
  assert.match(
    JSON.stringify(
      nodes(tree).find((node) => node.props?.className === 'native-record-corner').props.children,
    ),
    /全队.*0/,
  )
  // 精简 keeps only 犯规/机会/射门, grows the rows and is remembered locally.
  nodes(tree)
    .find(
      (node) =>
        node.props?.className?.startsWith('native-record-mode__item') &&
        node.props.children === '精简',
    )
    .props.onClick()
  tree = render()
  assert.equal(keys(tree).length, 8)
  assert.equal(storage.get('xiaoqiu:recorder-mode:org:user'), 'lite')
  assert.match(nodes(tree)[0].props.className, /is-lite/)
  // Long-press a player then pick a substitute: a8 comes on in a1's slot.
  players(tree)[0].props.onLongPress()
  tree = render()
  nodes(tree)
    .find((node) => node.props?.className === 'native-record-swap__item')
    .props.onClick()
  tree = render()
  assert.deepEqual(
    players(tree).map((node) => node.props.id.replace('record-player-', '')),
    ['a8', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
  )
  assert.deepEqual(
    [...storage.get('xiaoqiu:recorder-lineup:v2:org:user:match:a').bench],
    ['a1', 'a9'],
  )
  // Switching team records unattributed team actions.
  nodes(tree)
    .find((node) => node.props?.className === 'native-record-team is-idle')
    .props.onClick()
  tree = render()
  assert.equal(players(tree).length, 3)
  keys(tree)[0].props.onClick()
  assert.equal(writes.at(-1).teamId, 'b')
  assert.equal(writes.at(-1).playerId, null)
})
