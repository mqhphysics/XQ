export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/index/index',
    'pages/data-center/index',
    'pages/my-team/index',
    'pages/me/index',
    'pages/player-detail/index',
    'pages/post-detail/index',
    'pages/readonly-tournaments/index',
    'pages/readonly-tournament-detail/index',
    'pages/readonly-schedule/index',
    'pages/readonly-teams/index',
    'pages/readonly-match-detail/index',
    'pages/readonly-team-detail/index',
    ...((process.env as typeof process.env & { TARO_ENV?: string }).TARO_ENV === 'weapp'
      ? [
          'pages/team-manage/index',
          'pages/person-detail/index',
          'pages/messages/index',
          'pages/compose/index',
          'pages/favorites/index',
        ]
      : []),
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#183f2a',
    navigationBarTitleText: '晓球 · 校园足球',
    navigationBarTextStyle: 'white',
    ...((process.env as typeof process.env & { TARO_ENV?: string }).TARO_ENV === 'weapp'
      ? {
          navigationStyle: 'custom',
          navigationBarBackgroundColor: '#f7f8f4',
          navigationBarTextStyle: 'black',
        }
      : {}),
  },
})
