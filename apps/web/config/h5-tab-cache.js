/** H5-only. A custom tab bar keeps visited tab pages mounted without drawing Taro's bar. */
module.exports = (ctx) => {
  ctx.modifyAppConfig(({ appConfig }) => {
    if (process.env.TARO_ENV !== 'h5') return
    appConfig.tabBar = {
      custom: true,
      color: '#758174',
      selectedColor: '#183f2a',
      backgroundColor: '#f7f6f1',
      list: [
        { pagePath: 'pages/index/index', text: '首页' },
        { pagePath: 'pages/readonly-schedule/index', text: '赛程' },
        { pagePath: 'pages/data-center/index', text: '数据' },
        { pagePath: 'pages/my-team/index', text: '主队' },
        { pagePath: 'pages/me/index', text: '我的' },
      ],
    }
  })
}
