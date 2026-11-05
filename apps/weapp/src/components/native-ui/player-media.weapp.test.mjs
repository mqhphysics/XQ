import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import * as jsx from 'react/jsx-runtime'
import * as photos from '../../features/product/native-profile.logic.weapp.ts'

const react = {
  useEffect() {},
  useState: (value) => [value, () => {}],
  useRef: (value) => ({ current: value }),
}
const components = { Image: 'Image', Text: 'Text', View: 'View', Button: 'Button' }
function load(file, dependencies) {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (name) => dependencies[name],
  })
  return module.exports
}
function find(node, type) {
  if (!node) return null
  if (Array.isArray(node)) return node.map((n) => find(n, type)).find(Boolean)
  return node.type === type ? node : find(node.props?.children, type)
}
test('the player photo editor shows portraits, current linked avatars and newly selected previews', () => {
  const user = { linkedPlayer: { id: 'player', avatarUrl: '/uploaded-current.webp' } }
  const { NativePlayerFace: Face } = load('./player-face.weapp.tsx', {
    react,
    'react/jsx-runtime': jsx,
    '@tarojs/components': components,
    '../../features/product/product.repository': { resolveMediaUrl: (value) => value },
    '../../features/product/current-user.weapp': { useStoredSessionUser: () => user },
    '../../features/product/native-profile.logic.weapp': photos,
  })
  const { NativePlayerMedia: Media } = load('./player-media.weapp.tsx', {
    react,
    'react/jsx-runtime': jsx,
    '@tarojs/components': components,
    '@tarojs/taro': { default: {} },
    './player-face.weapp': { NativePlayerFace: Face },
  })
  const preview = (extra = {}) => {
    const tree = Media({ playerId: 'player', name: '周知远', onEditingChange() {}, ...extra })
    return Face(find(tree, Face).props)
  }
  assert.equal(
    find(
      preview({
        avatarUrl: '/api/media/defaults/player-avatar-03-v1.webp',
        portraitUrl: '/uploaded-portrait.webp',
      }),
      'Image',
    )?.props.src,
    '/uploaded-portrait.webp',
  )
  assert.equal(find(preview(), 'Image')?.props.src, '/uploaded-current.webp')
  assert.equal(
    find(preview({ avatarUrl: 'data:image/png;base64,new-preview' }), 'Image')?.props.src,
    'data:image/png;base64,new-preview',
  )
  assert.equal(
    find(Face({ playerId: 'player', name: '周知远', avatarUrl: '/stale-roster.webp' }), 'Image')
      ?.props.src,
    '/uploaded-current.webp',
    'Existing roster avatar priority stays intact',
  )
  user.linkedPlayer.avatarUrl = null
  assert.equal(find(preview(), 'Text')?.props.children, '远')
})
