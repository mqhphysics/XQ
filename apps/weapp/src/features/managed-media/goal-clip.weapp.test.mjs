import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url),
  ts = require('typescript')
const compiled = ts.transpileModule(
  fs.readFileSync(new URL('./goal-clip.weapp.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText
function harness(status = 'APPROVED') {
  let cursor = 0,
    effectCursor = 0,
    loads = 0,
    resolveLoad
  const cells = [],
    effects = [],
    pendingEffects = [],
    plays = []
  const download = new Promise((resolve) => {
    resolveLoad = resolve
  })
  const jsx = (type, props) => ({ type, props })
  const modules = {
    '@tarojs/components': { Button: 'button', Image: 'image', Text: 'text' },
    react: {
      useContext: () => true,
      useState(initial) {
        const i = cursor++
        if (!(i in cells)) cells[i] = initial
        return [
          cells[i],
          (v) => {
            cells[i] = typeof v === 'function' ? v(cells[i]) : v
          },
        ]
      },
      useRef(initial) {
        const i = cursor++
        return (cells[i] ||= { current: initial })
      },
      useEffect(fn, deps) {
        const i = effectCursor++,
          old = effects[i]
        if (!old || deps.some((v, j) => v !== old.deps[j]))
          pendingEffects.push(() => {
            old?.cleanup?.()
            effects[i] = { deps, cleanup: fn() }
          })
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../native-navigation/detail-context.weapp': { NativeDetailActiveContext: {} },
    '../../components/native-ui/preferences.weapp': {
      useNativePreferences: () => ({ autoplayGif: true }),
    },
    '../product/product.repository': { resolveMediaUrl: (v) => v },
    './gif-cache.weapp': {
      prepareMatchGif: () => {
        loads++
        return download
      },
    },
    '../../components/native-navigation/content-pager.weapp': { measureNativeContent() {} },
  }
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require: (n) => {
      if (!(n in modules)) throw Error(n)
      return modules[n]
    },
  })
  return {
    render(active) {
      cursor = 0
      effectCursor = 0
      const out = exports.NativeGoalClip({
        active,
        onPlay: (v) => plays.push(v),
        asset: {
          id: 'clip',
          version: 3,
          bytes: 4000000,
          durationMs: 14340,
          status,
          mimeType: 'image/gif',
          posterUrl: '/poster.webp',
        },
      })
      pendingEffects.splice(0).forEach((f) => f())
      return out
    },
    ready: async () => {
      resolveLoad('local/full-loop.gif')
      await new Promise((r) => setImmediate(r))
    },
    loads: () => loads,
    plays,
  }
}
const images = (n) => (n.props.children || []).flat().filter((x) => x && x.type === 'image')
test('a preview waits for a complete local file, then keeps a stable animation source through renders', async () => {
  const h = harness()
  let result = h.render(false)
  assert.equal(h.loads(), 1)
  assert.equal(images(result).length, 1)
  assert.equal(images(result)[0].props.src, '/poster.webp')
  result = h.render(true)
  assert.equal(images(result).length, 1)
  await result.props.onClick()
  assert.equal(h.plays.length, 0)
  await h.ready()
  result = h.render(true)
  const animation = images(result).find((i) => i.props.src === 'local/full-loop.gif')
  assert.ok(animation)
  animation.props.onLoad()
  const again = images(h.render(true)).find((i) => i.props.src === 'local/full-loop.gif')
  assert.equal(again.props.src, animation.props.src)
  assert.equal(again.props.mode, 'widthFix')
  assert.equal(h.plays[0], 'local/full-loop.gif')
  h.render(false)
  h.render(true)
  assert.equal(
    h.loads(),
    2,
    'preload and click share the cache promise; re-render does not download',
  )
})
test('pending private clips keep their existing authorized click path', () => {
  const h = harness('PENDING'),
    result = h.render(true)
  assert.equal(h.loads(), 0)
  assert.equal(images(result)[0].props.src, '/poster.webp')
  result.props.onClick()
  assert.equal(h.plays.length, 1)
  assert.equal(h.plays[0], undefined)
})
