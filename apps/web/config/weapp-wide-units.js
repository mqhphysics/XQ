/* global module, process, require */
/* eslint-disable @typescript-eslint/no-require-imports -- Taro loads build plugins as CommonJS. */
/**
 * Weapp only (Taro plugin). Phone styles are authored in 750-wide design px and compiled to rpx, so
 * on a wide window (foldable opened, tablet, PC) every size grows with the window: at 1024px wide
 * 1rpx is 1.37 CSS px and a 28px body font becomes 38px, which is why the wide layout looked blown
 * up. After Taro emits the .wxss, every `Nrpx` in a declaration becomes `calc(N*var(--u))`.
 * styles/foldable.weapp.scss sets `--u: calc(100vw / 750)` (= 1rpx) on page, so phones render as before, and
 * `--u: 0.5px` inside `@media (min-width: 520px)`, the same query and
 * threshold as nativeWideViewport(). Wide windows therefore show phone physical sizes (a 28px design
 * font is 14px, the website's desktop body size) with one rule instead of a hand-written override per
 * selector. Inline style strings built in TSX are not touched.
 */
const rpxToken = /(-?\d*\.?\d+)rpx\b/g
const unitProperty = '--u'

/* Hairlines stay rpx: WeChat rounds a sub-pixel rpx up to one device pixel, calc() would not. */
function scaleValue(value) {
  return value.replace(rpxToken, (token, number) =>
    Math.abs(Number(number)) <= 1 ? token : `calc(${number}*var(${unitProperty}))`,
  )
}

function transformWideUnits(css, postcss) {
  if (!css.includes('rpx')) return css
  const root = postcss.parse(css)
  let changed = false
  root.walkDecls((decl) => {
    if (decl.prop === unitProperty || !decl.value.includes('rpx')) return
    const value = scaleValue(decl.value)
    if (value !== decl.value) {
      decl.value = value
      changed = true
    }
  })
  return changed ? root.toString() : css
}

class WeappWideUnitsPlugin {
  constructor(postcss) {
    this.postcss = postcss
  }
  apply(compiler) {
    const { Compilation, sources } = compiler.webpack
    compiler.hooks.thisCompilation.tap('WeappWideUnitsPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'WeappWideUnitsPlugin', stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER },
        (assets) => {
          for (const name of Object.keys(assets)) {
            if (!/\.(wxss|css)$/.test(name)) continue
            const source = assets[name].source().toString()
            const next = transformWideUnits(source, this.postcss)
            if (next !== source) compilation.updateAsset(name, new sources.RawSource(next))
          }
        },
      )
    })
  }
}

module.exports = (ctx) => {
  ctx.modifyWebpackChain(({ chain }) => {
    if (process.env.TARO_ENV !== 'weapp') return
    const runner = require.resolve('@tarojs/webpack5-runner')
    const postcss = require(require.resolve('postcss', { paths: [runner] }))
    chain.plugin('weapp-wide-units').use(WeappWideUnitsPlugin, [postcss])
  })
}
module.exports.transformWideUnits = transformWideUnits
