import path from 'node:path'
import { defineConfig, type UserConfigExport } from '@tarojs/cli'

const env = process.env

const config: UserConfigExport = {
  projectName: 'xiaoqiu-weapp',
  date: '2026-10-24',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
  },
  plugins: [
    ['@tarojs/plugin-platform-weapp', { enablekeyboardAccessory: true }],
  ],
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false,
    },
  },
  cache: {
    enable: true,
  },
  env: {
    TARO_APP_API_BASE_URL: JSON.stringify(
      env.TARO_APP_API_BASE_URL ?? 'https://walter-latter-dont-productive.trycloudflare.com/api',
    ),
    TARO_APP_ORGANIZATION_ID: JSON.stringify(env.TARO_APP_ORGANIZATION_ID ?? ''),
    TARO_APP_LOCAL_SHORT_PASSWORDS: JSON.stringify(env.TARO_APP_LOCAL_SHORT_PASSWORDS ?? '0'),
    TARO_APP_API_PROXY_ENV: JSON.stringify(
      env.TARO_APP_API_PROXY_ENV ?? 'prod-d7g7tlsy7cddabd11',
    ),
    TARO_APP_API_PROXY_SERVICE: JSON.stringify(
      env.TARO_APP_API_PROXY_SERVICE ?? 'express-5g68',
    ),
    TARO_APP_API_PROXY_MEDIA_ORIGIN: JSON.stringify(
      env.TARO_APP_API_PROXY_MEDIA_ORIGIN ??
        'https://express-5g68-334157-12-1515521260.sh.run.tcloudbase.com',
    ),
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {},
      },
      url: {
        enable: true,
        config: {
          limit: 1024,
        },
      },
      cssModules: {
        enable: false,
      },
    },
  },
}

export default defineConfig(config)
