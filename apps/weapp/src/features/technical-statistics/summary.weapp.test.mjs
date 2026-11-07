import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
const contracts = createRequire(import.meta.url)('@xiaoqiu/contracts')
const oldValues = Object.fromEntries(
  contracts.TECHNICAL_TOTAL_KEYS.filter((key) => key !== 'corners').map((key) => [
    key,
    key === 'passSuccess' ? '9' : '0',
  ]),
)
const module = { exports: {} }
const source = ts.transpileModule(
  readFileSync(new URL('./summary.weapp.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText
vm.runInNewContext(source, {
  module,
  exports: module.exports,
  require(name) {
    if (name === 'react/jsx-runtime') return jsx
    if (name === 'react')
      return {
        useRef: (current) => ({ current }),
        useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
        useEffect() {},
      }
    if (name === '@tarojs/components')
      return { Button: 'Button', Input: 'Input', Text: 'Text', View: 'View' }
    if (name === '@tarojs/taro')
      return { default: { getStorageSync: () => ({ values: oldValues, reason: '' }) } }
    if (name.includes('session'))
      return { readSession: () => ({ user: { id: 'user', organizationId: 'org' } }) }
    return { ...contracts, technicalId: () => 'action' }
  },
})
const nodes = (node) =>
  !node || typeof node !== 'object'
    ? []
    : Array.isArray(node)
      ? node.flatMap(nodes)
      : [node, ...nodes(node.props?.children)]
test('adding team corners preserves existing v2 summary drafts and does not expose a player-corner editor', () => {
  const render = (playerId) =>
    nodes(
      module.exports.NativeTechnicalSummary({
        workspace: { matchId: 'match', canRecord: true, operations: [] },
        teamId: 'team',
        playerId,
        name: '球队',
        onSave() {},
      }),
    )
  const team = render(null)
  assert.ok(team.some((node) => node.type === 'Input' && node.props.value === '9'))
  const cornerGroup = team.find(
    (node) =>
      node.props?.className === 'native-technical-form__group' &&
      nodes(node).some((child) => child.type === 'Text' && child.props.children === '角球'),
  )
  assert.ok(cornerGroup)
  assert.equal(nodes(cornerGroup).find((node) => node.type === 'Input').props.value, '0')
  assert.equal(
    render('player').some((node) => node.type === 'Text' && node.props.children === '角球'),
    false,
  )
})
