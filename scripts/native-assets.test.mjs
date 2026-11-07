import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, cp, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { verifyNativeAssets } from '../apps/weapp/scripts/verify-native-assets.mjs'

test('release asset gate catches the 0.8.9 external SVG and missing PNG regressions', async () => {
  const parent = process.platform === 'win32' ? 'D:/MuDevSpace/XQ-work' : tmpdir()
  const root = await mkdtemp(join(parent, 'xq-asset-test-'))
  try {
    const folder = join(root, 'assets/login-art')
    await mkdir(folder, { recursive: true })
    const png = join(folder, 'stadium-particle-plate.weapp.png')
    await cp(resolve('apps/weapp/src/assets/login-art/stadium-particle-plate.weapp.png'), png)
    const icons = [
      '.native-badge--player',
      '.native-badge--admin',
      '.mobile-tabbar__icon.mobile-tabbar__icon',
    ]
    const css =
      icons
        .map((icon) => `${icon}{background-image:url(data:image/svg+xml;base64,PHN2Zy8+);}`)
        .join('') +
      ['schedule', 'data', 'me']
        .map((tab) => `.mobile-tabbar__icon--${tab}{background-position:-44px 0}`)
        .join('')
    await writeFile(join(root, 'app.wxss'), css)
    assert.equal((await verifyNativeAssets(root)).inlineIcons, 3)
    await writeFile(
      join(root, 'app.wxss'),
      css + '.native-badge--player{background-image:url(/assets/profile-icons/football.svg)}',
    )
    await assert.rejects(verifyNativeAssets(root), /本地SVG/)
    await rm(png)
    await assert.rejects(verifyNativeAssets(root), /PNG/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
