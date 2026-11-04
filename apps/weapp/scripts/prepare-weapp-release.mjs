import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { log } from 'node:console'
import process from 'node:process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = resolve(project, '../..')
const { version } = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'))
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('小程序版本使用三段数字，例如0.5.1')
const sourceFlag = process.argv.indexOf('--source-dir')
if (sourceFlag >= 0 && !process.argv[sourceFlag + 1])
  throw new Error('--source-dir需要微信构建输出目录')
const source = sourceFlag >= 0 ? resolve(process.argv[sourceFlag + 1]) : join(project, 'dist-weapp')
await stat(join(source, 'app.json'))
const privateConfig = JSON.parse(
  (await readFile(join(project, 'project.private.config.json'), 'utf8')).replace(/^\uFEFF/, ''),
)
if (!/^wx[\da-f]{16}$/.test(privateConfig.appid || ''))
  throw new Error('请先在本地project.private.config.json配置正式AppID')
const target = resolve(repository, '../XQ-work/releases', version)
// Every upload gets its own complete project. Never rewrite a previously checked release.
await mkdir(dirname(target), { recursive: true })
await mkdir(target)
await cp(source, join(target, 'miniprogram'), { recursive: true })
await writeFile(
  join(target, 'project.config.json'),
  JSON.stringify(
    {
      appid: privateConfig.appid,
      projectname: `xiaoqiu-${version}`,
      description: `晓球 ${version}`,
      miniprogramRoot: 'miniprogram/',
      compileType: 'miniprogram',
      libVersion: privateConfig.libVersion,
      setting: {
        urlCheck: true,
        es6: false,
        enhance: false,
        compileHotReLoad: false,
        ignoreDevUnusedFiles: false,
        ignoreUploadUnusedFiles: false,
      },
    },
    null,
    2,
  ),
)
log(`版本：${version}\n待验证上传的完整构建副本：${target}`)
