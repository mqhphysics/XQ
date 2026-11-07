import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import process from 'node:process'
import console from 'node:console'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const loginAsset = 'assets/login-art/stadium-particle-plate.weapp.png'
const requiredIcons = [
  '.native-badge--player',
  '.native-badge--admin',
  '.mobile-tabbar__icon.mobile-tabbar__icon',
]

export async function verifyNativeAssets(root) {
  const original = await readFile(join(project, 'src', loginAsset))
  const compiled = await readFile(join(root, loginAsset)).catch(() => {
    throw new Error('登录操场必须作为PNG包含在上传工程中')
  })
  if (!compiled.equals(original) || compiled.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error('登录PNG与已认可源码素材不一致')
  const styles = []
  async function walk(directory) {
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const target = join(directory, file.name)
      if (file.isDirectory()) await walk(target)
      else if (file.name.endsWith('.wxss')) styles.push(await readFile(target, 'utf8'))
    }
  }
  await walk(root)
  const css = styles.join('\n')
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
  for (const icon of requiredIcons) {
    if (
      !rules.some(
        (rule) => rule[1].includes(icon) && /url\(["']?data:image\/svg\+xml/.test(rule[2]),
      )
    )
      throw new Error(`原生关键图标未内联：${icon}`)
  }
  for (const tab of ['schedule', 'data', 'me'])
    if (
      !rules.some(
        (rule) =>
          rule[1].includes(`.mobile-tabbar__icon--${tab}`) && /background-position:/.test(rule[2]),
      )
    )
      throw new Error(`底部导航图标缺少定位：${tab}`)
  const externalSvg = /url\(\s*["']?(?!data:|https?:|\/\/)[^)'"\s]+\.svg(?:[?'"\s)]|$)/i
  if (externalSvg.test(css)) throw new Error('WXSS中发现本地SVG文件背景，请恢复内联资源')
  return {
    loginPng: true,
    inlineIcons: requiredIcons.length,
    loginSha256: createHash('sha256').update(compiled).digest('hex'),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyNativeAssets(resolve(process.argv[2] || join(project, 'dist-weapp')))
  console.log(JSON.stringify(result))
}
