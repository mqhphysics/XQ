import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url),
  ts = require('typescript')
const source = fs.readFileSync(new URL('./goal-clip.weapp.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
function harness() {
  let cursor = 0
  const state = []
  const jsx = (type, props) => ({ type, props })
  const modules = {
    '@tarojs/components': { Button: 'button', Image: 'image', Text: 'text' },
    react: {
      useContext: () => true,
      useEffect() {},
      useRef: (value) => ({ current: value }),
      useState: (initial) => {
        const index = cursor++
        if (!(index in state)) state[index] = initial
        return [
          state[index],
          (value) => {
            state[index] = typeof value === 'function' ? value(state[index]) : value
          },
        ]
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '../native-navigation/detail-context.weapp': { NativeDetailActiveContext: {} },
    '../../components/native-ui/preferences.weapp': {
      useNativePreferences: () => ({ autoplayGif: true }),
    },
    '../product/product.repository': { resolveMediaUrl: (value) => value },
    './match-gif.weapp': { matchGifUrl: () => '/original.gif?v=3' },
    '../../components/native-navigation/content-pager.weapp': { measureNativeContent() {} },
  }
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (!(name in modules)) throw Error(name)
      return modules[name]
    },
  })
  return (active, status = 'APPROVED') => {
    cursor = 0
    return exports.NativeGoalClip({
      active,
      onPlay() {},
      asset: { status, mimeType: 'image/gif', posterUrl: '/poster.webp' },
    })
  }
}
const images = (node) =>
  (node.props.children || []).flat().filter((item) => item && item.type === 'image')
test('a match preloads the original GIF and activation plays without a scroll observation', () => {
  const render = harness(),
    background = images(render(false))
  const preload = background.find((image) => image.props.src.startsWith('/original.gif'))
  assert.ok(preload)
  assert.equal(preload.props.lazyLoad, false)
  const initial = images(render(true)).find((image) => image.props.src.startsWith('/original.gif'))
  assert.equal(initial.props.className, '', 'visible GIF must render before its load event')
  preload.props.onLoad()
  const visible = images(render(true)).find((image) => image.props.src.startsWith('/original.gif'))
  assert.ok(visible)
  assert.equal(visible.props.className, '')
  assert.equal(visible.props.mode, 'widthFix')
})
test('private pending media keeps the poster and authorized click path', () => {
  const result = images(harness()(true, 'PENDING'))
  assert.equal(result.length, 1)
  assert.equal(result[0].props.src, '/poster.webp')
})
