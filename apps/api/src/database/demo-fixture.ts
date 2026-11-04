import { createHash } from 'node:crypto'

import {
  DominantFoot,
  MatchStatus,
  PlayerPosition,
  PostType,
  Role,
  VerificationLevel,
} from '../generated/prisma/client'

export const DEMO_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001'
export const DEMO_PASSWORD = 'Xiaoqiu2026!'
export const DEMO_GROUP_CODES = ['A', 'B', 'C', 'D'] as const

export interface DemoTeamDefinition {
  code: string
  name: string
  shortName: string
  collegeName: string
  description: string
  motto: string
  primaryColor: string
  secondaryColor: string
  foundedYear: number
  major: string
}

export interface DemoPlayerDefinition {
  id: string
  sourceKey: string
  studentId: string
  displayName: string
  jerseyName: string
  shirtNumber: string
  position: PlayerPosition
  secondaryPosition: PlayerPosition
  dominantFoot: DominantFoot
  heightCm: number
  academicYear: string
  major: string
  hometown: string
  bio: string
  profileColor: string
  portraitUrl: string
  ratings: {
    shooting: number
    speed: number
    dribbling: number
    passing: number
    defending: number
  }
  teamIndex: number
}

export interface DemoMatchDefinition {
  code: string
  title: string
  tournament: '2025' | '2026'
  stage: 'GROUP' | 'KNOCKOUT'
  group?: (typeof DEMO_GROUP_CODES)[number] | undefined
  round: number
  homeTeamIndex?: number | undefined
  awayTeamIndex?: number | undefined
  status: MatchStatus
  scheduledStartAt: string
  homeScore?: number | undefined
  awayScore?: number | undefined
  homePenaltyScore?: number | undefined
  awayPenaltyScore?: number | undefined
  statusReason?: string | undefined
  summary?: string | undefined
  attendance?: number | undefined
}

export interface DemoAccountDefinition {
  username: string
  displayName: string
  realName: string
  studentId: string
  email: string
  avatarUrl: string
  verificationLevel: VerificationLevel
  linkedTeamIndex?: number
  linkedPlayerIndex?: number
  roles: Array<{ role: Role; scope: 'ORGANIZATION' | 'TOURNAMENT' | 'TEAM' }>
  primaryTeamIndex: number
  followedTeamIndexes: number[]
  bio: string
}

export type DemoPostAudience = 'TOURNAMENT' | 'PLATFORM'

export interface DemoPostDefinition {
  key: string
  type: PostType
  /** Official posts only. Platform notices are organization-wide and omit the tournament. */
  audience?: DemoPostAudience
  authorUsername?: string
  title?: string
  body: string
  imageUrl?: string
  publishedAt: string
  /** Skip demo likes and comments (e.g. the platform welcome notice). */
  quiet?: boolean
}

/** Same copy as the one-time H5 welcome card; kept last among platform notices. */
export const PLATFORM_WELCOME_POST_KEY = 'platform-welcome'
export const PLATFORM_WELCOME_POST_BODY = [
  '这里记录我们学校的每一场校园足球。',
  '· 赛程、比分和积分榜都在「赛程」「数据」里，右上角可以切换杯赛和男子组、女子组。',
  '· 选一支主队，它的下一场比赛会出现在首页。',
  '· 在「绿茵动态」里发图、评论，留下场边的瞬间。',
  '· 微信小程序正在开发中，你的信息将会在小程序中同步。',
  '现在是内部测试阶段，遇到问题欢迎随时反馈。',
].join('\n')

export function isPlatformDemoPost(post: DemoPostDefinition): boolean {
  return post.type === PostType.OFFICIAL && post.audience === 'PLATFORM'
}

export const DEMO_TEAMS: DemoTeamDefinition[] = [
  {
    code: 'DEMO-PHY-1',
    name: '物院一队',
    shortName: '物院一队',
    collegeName: '物理科学与技术学院',
    description: '以高年级骨干为中轴的攻守平衡球队，强调前场压迫与快速转移。',
    motto: '知行合一，向光而行',
    primaryColor: '#036972',
    secondaryColor: '#8ebcc0',
    foundedYear: 2016,
    major: '物理学',
  },
  {
    code: 'DEMO-PHY-2',
    name: '物院二队',
    shortName: '物院二队',
    collegeName: '物理科学与技术学院',
    description: '年轻、敢于持球的学院新生力量，习惯从后场耐心组织进攻。',
    motto: '保持热爱，奔向下一球',
    primaryColor: '#036972',
    secondaryColor: '#8ebcc0',
    foundedYear: 2021,
    major: '电子信息科学与技术',
  },
  {
    code: 'DEMO-MATH',
    name: '数院星火',
    shortName: '星火',
    collegeName: '数学与统计学学院',
    description: '阵型纪律严谨，擅长通过中场人数优势控制比赛节奏。',
    motto: '精确到最后一分钟',
    primaryColor: '#9f2f35',
    secondaryColor: '#f7efe2',
    foundedYear: 2014,
    major: '数学与应用数学',
  },
  {
    code: 'DEMO-CS',
    name: '计算机雷霆',
    shortName: '雷霆',
    collegeName: '计算机学院',
    description: '转换速度快、边路冲击鲜明，是杯赛中最具攻击性的队伍之一。',
    motto: '快速迭代，持续进球',
    primaryColor: '#2c3345',
    secondaryColor: '#4cc9b0',
    foundedYear: 2013,
    major: '计算机科学与技术',
  },
  {
    code: 'DEMO-CHEM',
    name: '化院原子',
    shortName: '原子',
    collegeName: '化学学院',
    description: '重视身体对抗和定位球，在胶着比赛中保持很强的执行力。',
    motto: '聚合每一份力量',
    primaryColor: '#7b3fa1',
    secondaryColor: '#f1d65c',
    foundedYear: 2015,
    major: '化学',
  },
  {
    code: 'DEMO-BIO',
    name: '生科青藤',
    shortName: '青藤',
    collegeName: '生命科学学院',
    description: '跑动积极、整体协作出色，常通过连续的小范围配合创造机会。',
    motto: '扎根生长，向上突破',
    primaryColor: '#148c72',
    secondaryColor: '#f6fbf2',
    foundedYear: 2017,
    major: '生物科学',
  },
  {
    code: 'DEMO-GEO',
    name: '地科山岳',
    shortName: '山岳',
    collegeName: '城市与环境科学学院',
    description: '防线稳定、反击直接，善于把有限机会转化成高质量射门。',
    motto: '稳如山岳，行至远方',
    primaryColor: '#31708f',
    secondaryColor: '#e8d8a8',
    foundedYear: 2012,
    major: '地理科学',
  },
  {
    code: 'DEMO-EDU',
    name: '教育联队',
    shortName: '教育联队',
    collegeName: '教育学院',
    description: '经验与活力并存，前锋线个人能力突出，比赛气质沉稳。',
    motto: '以球会友，共同成长',
    primaryColor: '#d45b35',
    secondaryColor: '#fff4e7',
    foundedYear: 2011,
    major: '教育学',
  },
  {
    code: 'DEMO-LIT',
    name: '文院墨锋',
    shortName: '墨锋',
    collegeName: '文学院',
    description: '中场传递细腻，善于用连续跑位打开肋部空间。',
    motto: '落笔有声，出脚有锋',
    primaryColor: '#6f3f77',
    secondaryColor: '#f2e7d8',
    foundedYear: 2018,
    major: '汉语言文学',
  },
  {
    code: 'DEMO-HIS',
    name: '历院长河',
    shortName: '长河',
    collegeName: '历史文化学院',
    description: '比赛节奏沉稳，依靠紧凑阵型和耐心推进积累优势。',
    motto: '奔流不息，步步向前',
    primaryColor: '#8a542d',
    secondaryColor: '#f3d49b',
    foundedYear: 2016,
    major: '历史学',
  },
  {
    code: 'DEMO-ECON',
    name: '经管凌云',
    shortName: '凌云',
    collegeName: '经济与工商管理学院',
    description: '攻守转换果断，前场多人交叉跑位是球队的鲜明特点。',
    motto: '谋定而动，志在凌云',
    primaryColor: '#1d5f8a',
    secondaryColor: '#e8b84b',
    foundedYear: 2013,
    major: '经济学',
  },
  {
    code: 'DEMO-FL',
    name: '外院远航',
    shortName: '远航',
    collegeName: '外国语学院',
    description: '边路速度出色，习惯通过快速换位持续冲击对手防线。',
    motto: '越过边界，奔向远方',
    primaryColor: '#287f79',
    secondaryColor: '#f4f0dc',
    foundedYear: 2019,
    major: '英语',
  },
  {
    code: 'DEMO-LAW',
    name: '法院明律',
    shortName: '明律',
    collegeName: '法学院',
    description: '防守纪律严明，擅长在高强度对抗中保持阵型完整。',
    motto: '守正明律，敢拼敢赢',
    primaryColor: '#334d75',
    secondaryColor: '#d8b55b',
    foundedYear: 2015,
    major: '法学',
  },
  {
    code: 'DEMO-JOUR',
    name: '新闻逐光',
    shortName: '逐光',
    collegeName: '新闻传播学院',
    description: '压迫积极、反应迅速，能够在抢断后第一时间形成推进。',
    motto: '记录此刻，追逐每束光',
    primaryColor: '#a34236',
    secondaryColor: '#f0d86f',
    foundedYear: 2020,
    major: '新闻学',
  },
  {
    code: 'DEMO-MUSIC',
    name: '音院和声',
    shortName: '和声',
    collegeName: '音乐学院',
    description: '团队配合流畅，重视无球跑动与进攻节奏的变化。',
    motto: '同频共振，奏响胜利',
    primaryColor: '#7f477f',
    secondaryColor: '#c9a8dc',
    foundedYear: 2017,
    major: '音乐学',
  },
  {
    code: 'DEMO-ART',
    name: '美院丹青',
    shortName: '丹青',
    collegeName: '美术学院',
    description: '创造力鲜明，前场球员敢于用个人技术解决局部难题。',
    motto: '挥洒丹青，绘就胜局',
    primaryColor: '#2f7051',
    secondaryColor: '#e79b65',
    foundedYear: 2018,
    major: '美术学',
  },
]

// All sixteen teams enter the 2026 competition; only eight advance to the knockout stage.
export const DEMO_TOURNAMENT_TEAMS = DEMO_TEAMS

const surnames = [
  '周',
  '陈',
  '林',
  '许',
  '张',
  '吴',
  '郑',
  '何',
  '徐',
  '孙',
  '高',
  '罗',
  '梁',
  '宋',
  '唐',
  '彭',
  '韩',
  '曹',
  '邓',
  '潘',
  '谢',
  '袁',
  '蒋',
  '程',
  '叶',
  '苏',
  '曾',
  '傅',
]

const givenNames = [
  '启川',
  '景行',
  '明澈',
  '承宇',
  '亦航',
  '思远',
  '嘉树',
  '泽安',
  '闻野',
  '子谦',
  '星野',
  '清和',
  '云舟',
  '予安',
  '知远',
  '骁然',
  '怀瑾',
  '屹辰',
  '沐阳',
  '言蹊',
]

const hometowns = [
  '武汉',
  '宜昌',
  '襄阳',
  '荆州',
  '黄冈',
  '长沙',
  '南昌',
  '合肥',
  '郑州',
  '杭州',
  '广州',
  '成都',
]
const shirtNumbers = ['1', '12', '2', '3', '4', '5', '6', '8', '10', '14', '7', '9', '11', '18']

export const DEMO_PLAYERS: DemoPlayerDefinition[] = DEMO_TEAMS.flatMap((team, teamIndex) =>
  Array.from({ length: 14 }, (_, playerIndex) => {
    const globalIndex = teamIndex * 14 + playerIndex
    const surname = surnames[globalIndex % surnames.length]!
    const givenNameIndex =
      (Math.floor(globalIndex / surnames.length) + globalIndex * 7) % givenNames.length
    const displayName = `${surname}${givenNames[givenNameIndex]}`
    const position = positionForIndex(playerIndex)
    const secondaryPosition = secondaryPositionFor(position, playerIndex)
    const style = styleForPosition(position)
    const academicYear = `${2023 + ((teamIndex + playerIndex) % 3)}级`
    const studentSuffix = `99${String(1000 + ((globalIndex * 7919 + 729) % 9000)).padStart(4, '0')}`
    const portraitNumber = String((globalIndex % 16) + 1).padStart(2, '0')

    return {
      id: fixtureId(`player:${team.code}:${playerIndex + 1}`),
      sourceKey: `DEMO-2026-${team.code}-${String(playerIndex + 1).padStart(2, '0')}`,
      studentId: `${academicYear.slice(0, 4)}${studentSuffix}`,
      displayName,
      jerseyName: displayName.slice(1),
      shirtNumber: shirtNumbers[playerIndex]!,
      position,
      secondaryPosition,
      dominantFoot:
        playerIndex % 7 === 0
          ? DominantFoot.BOTH
          : playerIndex % 3 === 0
            ? DominantFoot.LEFT
            : DominantFoot.RIGHT,
      heightCm: 168 + ((teamIndex * 5 + playerIndex * 3) % 20),
      academicYear,
      major: team.major,
      hometown: hometowns[(teamIndex * 3 + playerIndex) % hometowns.length]!,
      bio: `${team.shortName}${positionLabel(position)}，${style}。训练之外喜欢记录校园比赛，也期待在绿茵杯留下属于球队的片段。`,
      profileColor: team.primaryColor,
      portraitUrl: `/api/media/demo/portraits/${portraitNumber}.jpg`,
      ratings: ratingsForPosition(position, globalIndex),
      teamIndex,
    }
  }),
)

export const DEMO_MATCHES: DemoMatchDefinition[] = [
  match(
    'GC26-A-R1-01',
    'A组第1轮',
    '2026',
    'GROUP',
    'A',
    1,
    0,
    1,
    MatchStatus.FINISHED,
    '2026-08-24T10:00:00+08:00',
    2,
    1,
    '物院德比节奏紧凑，一队凭借下半场反击锁定胜局。',
    326,
  ),
  match(
    'GC26-A-R1-02',
    'A组第1轮',
    '2026',
    'GROUP',
    'A',
    1,
    2,
    3,
    MatchStatus.FINISHED,
    '2026-08-24T16:00:00+08:00',
    1,
    1,
    '星火与雷霆各自掌控半场，最终握手言和。',
    284,
  ),
  match(
    'GC26-B-R1-01',
    'B组第1轮',
    '2026',
    'GROUP',
    'B',
    1,
    4,
    5,
    MatchStatus.FINISHED,
    '2026-08-25T10:00:00+08:00',
    1,
    0,
    '原子利用一次定位球取得开门红。',
    241,
  ),
  match(
    'GC26-B-R1-02',
    'B组第1轮',
    '2026',
    'GROUP',
    'B',
    1,
    6,
    7,
    MatchStatus.FINISHED,
    '2026-08-25T16:00:00+08:00',
    2,
    3,
    '教育联队在终场前完成逆转，打出首轮进球最多的比赛。',
    309,
  ),
  match(
    'GC26-A-R2-01',
    'A组第2轮',
    '2026',
    'GROUP',
    'A',
    2,
    0,
    2,
    MatchStatus.FINISHED,
    '2026-08-28T16:00:00+08:00',
    3,
    0,
    '一队通过持续前压取得三球胜利。',
    338,
  ),
  match(
    'GC26-A-R2-02',
    'A组第2轮',
    '2026',
    'GROUP',
    'A',
    2,
    1,
    3,
    MatchStatus.FINISHED,
    '2026-08-28T19:00:00+08:00',
    2,
    2,
    '双方四次改写比分，雷霆终场前扳平。',
    351,
  ),
  match(
    'GC26-B-R2-01',
    'B组第2轮',
    '2026',
    'GROUP',
    'B',
    2,
    4,
    6,
    MatchStatus.FINISHED,
    '2026-08-29T16:00:00+08:00',
    2,
    2,
    '山岳依靠高效反击从两球落后中追平。',
    276,
  ),
  match(
    'GC26-B-R2-02',
    'B组第2轮',
    '2026',
    'GROUP',
    'B',
    2,
    5,
    7,
    MatchStatus.FINISHED,
    '2026-08-29T19:00:00+08:00',
    2,
    1,
    '青藤凭借终场前的反击拿下关键三分。',
    412,
  ),
  match(
    'GC26-A-R3-01',
    'A组第3轮',
    '2026',
    'GROUP',
    'A',
    3,
    0,
    3,
    MatchStatus.FINISHED,
    '2026-08-30T10:00:00+08:00',
    2,
    0,
    '一队零封雷霆，以小组全胜战绩锁定头名。',
    318,
  ),
  match(
    'GC26-A-R3-02',
    'A组第3轮',
    '2026',
    'GROUP',
    'A',
    3,
    1,
    2,
    MatchStatus.FINISHED,
    '2026-08-30T13:00:00+08:00',
    2,
    1,
    '二队把握住末轮机会，拿到A组第二个晋级席位。',
    301,
  ),
  match(
    'GC26-B-R3-01',
    'B组第3轮',
    '2026',
    'GROUP',
    'B',
    3,
    4,
    7,
    MatchStatus.FINISHED,
    '2026-08-30T16:00:00+08:00',
    0,
    2,
    '教育联队用两次快速反击锁定B组第一。',
    287,
  ),
  match(
    'GC26-B-R3-02',
    'B组第3轮',
    '2026',
    'GROUP',
    'B',
    3,
    5,
    6,
    MatchStatus.FINISHED,
    '2026-08-30T19:00:00+08:00',
    1,
    1,
    '青藤守住平局，凭净胜球优势取得八强席位。',
    294,
  ),
  ...(['C', 'D'] as const).flatMap((group, groupIndex) => {
    const offset = 8 + groupIndex * 4
    const fixtures = [
      [1, 0, 1, 2, 1],
      [1, 2, 3, 1, 1],
      [2, 0, 2, 3, 0],
      [2, 1, 3, 2, 2],
      [3, 0, 3, 2, 0],
      [3, 1, 2, 2, 1],
    ] as const
    return fixtures.map(([round, home, away, homeScore, awayScore], index) =>
      match(
        `GC26-${group}-R${round}-${String((index % 2) + 1).padStart(2, '0')}`,
        `${group}组第${round}轮`,
        '2026',
        'GROUP',
        group,
        round,
        offset + home,
        offset + away,
        MatchStatus.FINISHED,
        `2026-08-${round === 1 ? '25' : round === 2 ? '28' : '30'}T${index % 2 === 0 ? '10' : '16'}:00:00+08:00`,
        homeScore,
        awayScore,
        `${DEMO_TEAMS[offset + home]!.name}与${DEMO_TEAMS[offset + away]!.name}完成小组赛演示对阵。`,
        250 + index * 10,
      ),
    )
  }),
  match(
    'GC26-QF-01',
    '八强赛 1',
    '2026',
    'KNOCKOUT',
    undefined,
    2,
    0,
    7,
    MatchStatus.FINISHED,
    '2026-09-01T10:00:00+08:00',
    2,
    0,
    '物院一队延续前场压迫，率先进入四强。',
    361,
  ),
  match(
    'GC26-QF-02',
    '八强赛 2',
    '2026',
    'KNOCKOUT',
    undefined,
    2,
    5,
    12,
    MatchStatus.FINISHED,
    '2026-09-01T10:00:00+08:00',
    1,
    0,
    '青藤依靠一次快速反击取得四强席位。',
    327,
  ),
  match(
    'GC26-QF-03',
    '八强赛 3',
    '2026',
    'KNOCKOUT',
    undefined,
    2,
    8,
    13,
    MatchStatus.FINISHED,
    '2026-09-01T16:00:00+08:00',
    2,
    1,
    '文院队在下半场打入制胜球，赢下八强焦点战。',
    398,
  ),
  match(
    'GC26-QF-04',
    '八强赛 4',
    '2026',
    'KNOCKOUT',
    undefined,
    2,
    1,
    9,
    MatchStatus.FINISHED,
    '2026-09-01T16:00:00+08:00',
    2,
    1,
    '物院二队顶住反扑，拿到最后一个四强席位。',
    344,
  ),
  match(
    'GC26-SF-01',
    '半决赛 1',
    '2026',
    'KNOCKOUT',
    undefined,
    3,
    0,
    5,
    MatchStatus.FINISHED,
    '2026-09-01T19:00:00+08:00',
    2,
    1,
    '一队在下半场打入制胜球，率先取得决赛席位。',
    468,
  ),
  match(
    'GC26-SF-02',
    '半决赛 2',
    '2026',
    'KNOCKOUT',
    undefined,
    3,
    8,
    1,
    MatchStatus.SCHEDULED,
    '2026-09-02T19:00:00+08:00',
  ),
  match(
    'GC26-THIRD',
    '三四名决赛',
    '2026',
    'KNOCKOUT',
    undefined,
    4,
    5,
    undefined,
    MatchStatus.SCHEDULED,
    '2026-09-14T16:00:00+08:00',
  ),
  match(
    'GC26-FINAL',
    '绿茵杯决赛',
    '2026',
    'KNOCKOUT',
    undefined,
    4,
    0,
    undefined,
    MatchStatus.SCHEDULED,
    '2026-09-14T19:00:00+08:00',
  ),

  match(
    'GC25-QF-01',
    '2025 八强赛 1',
    '2025',
    'KNOCKOUT',
    undefined,
    1,
    0,
    7,
    MatchStatus.FINISHED,
    '2025-05-10T14:00:00+08:00',
    2,
    0,
    '物院一队稳健晋级四强。',
    255,
  ),
  match(
    'GC25-QF-02',
    '2025 八强赛 2',
    '2025',
    'KNOCKOUT',
    undefined,
    1,
    2,
    5,
    MatchStatus.FINISHED,
    '2025-05-10T16:00:00+08:00',
    1,
    2,
    '青藤在下半场完成逆转。',
    231,
  ),
  match(
    'GC25-QF-03',
    '2025 八强赛 3',
    '2025',
    'KNOCKOUT',
    undefined,
    1,
    3,
    6,
    MatchStatus.FINISHED,
    '2025-05-11T14:00:00+08:00',
    3,
    1,
    '雷霆用快速进攻建立优势。',
    288,
  ),
  match(
    'GC25-QF-04',
    '2025 八强赛 4',
    '2025',
    'KNOCKOUT',
    undefined,
    1,
    4,
    1,
    MatchStatus.FINISHED,
    '2025-05-11T16:00:00+08:00',
    1,
    1,
    '点球大战后物院二队晋级。',
    302,
    3,
    4,
  ),
  match(
    'GC25-SF-01',
    '2025 半决赛 1',
    '2025',
    'KNOCKOUT',
    undefined,
    2,
    0,
    5,
    MatchStatus.FINISHED,
    '2025-05-17T15:00:00+08:00',
    2,
    1,
    '一队在加速阶段连续创造机会。',
    347,
  ),
  match(
    'GC25-SF-02',
    '2025 半决赛 2',
    '2025',
    'KNOCKOUT',
    undefined,
    2,
    3,
    1,
    MatchStatus.FINISHED,
    '2025-05-17T18:00:00+08:00',
    1,
    2,
    '二队防守反击奏效，首次进入决赛。',
    366,
  ),
  match(
    'GC25-THIRD',
    '2025 三四名决赛',
    '2025',
    'KNOCKOUT',
    undefined,
    3,
    5,
    3,
    MatchStatus.FINISHED,
    '2025-05-24T15:00:00+08:00',
    2,
    3,
    '雷霆获得季军。',
    381,
  ),
  match(
    'GC25-FINAL',
    '2025 绿茵杯决赛',
    '2025',
    'KNOCKOUT',
    undefined,
    3,
    0,
    1,
    MatchStatus.FINISHED,
    '2025-05-24T19:00:00+08:00',
    2,
    2,
    '物院一队通过点球大战夺得冠军。',
    618,
    5,
    4,
  ),
]

export const DEMO_ACCOUNTS: DemoAccountDefinition[] = [
  {
    username: 'student',
    displayName: '知夏看球',
    realName: '林知夏',
    studentId: '2024990001',
    email: 'student@xiaoqiu.demo',
    avatarUrl: '/api/media/demo/portraits/09.jpg',
    verificationLevel: VerificationLevel.STUDENT_VERIFIED,
    roles: [],
    primaryTeamIndex: 2,
    followedTeamIndexes: [0, 4],
    bio: '普通学生用户，关注校园比赛和数院星火。',
  },
  {
    username: 'player',
    displayName: '星野',
    realName: DEMO_PLAYERS[10]!.displayName,
    studentId: DEMO_PLAYERS[10]!.studentId,
    email: 'player@xiaoqiu.demo',
    avatarUrl: '/api/media/demo/portraits/13.jpg',
    verificationLevel: VerificationLevel.PLAYER_CONFIRMED,
    linkedTeamIndex: 0,
    linkedPlayerIndex: 10,
    roles: [],
    primaryTeamIndex: 0,
    followedTeamIndexes: [2],
    bio: '已认领球员档案的参赛球员。',
  },
  {
    username: 'captain',
    displayName: '明澈队长',
    realName: DEMO_PLAYERS[6]!.displayName,
    studentId: DEMO_PLAYERS[6]!.studentId,
    email: 'captain@xiaoqiu.demo',
    avatarUrl: '/api/media/demo/portraits/06.jpg',
    verificationLevel: VerificationLevel.PLAYER_CONFIRMED,
    linkedTeamIndex: 0,
    linkedPlayerIndex: 6,
    roles: [{ role: Role.TEAM_CAPTAIN, scope: 'TEAM' }],
    primaryTeamIndex: 0,
    followedTeamIndexes: [1, 3],
    bio: '物院一队队长，负责球队沟通和名单确认。',
  },
  {
    username: 'reporter',
    displayName: '嘉言现场',
    realName: '沈嘉言',
    studentId: '2023990002',
    email: 'reporter@xiaoqiu.demo',
    avatarUrl: '/api/media/demo/portraits/14.jpg',
    verificationLevel: VerificationLevel.STAFF_VERIFIED,
    roles: [{ role: Role.MATCH_REPORTER, scope: 'TOURNAMENT' }],
    primaryTeamIndex: 3,
    followedTeamIndexes: [0, 7],
    bio: '绿茵杯信息员，负责授权场次的现场数据记录。',
  },
  {
    username: 'admin',
    displayName: '清越赛事组',
    realName: '韩清越',
    studentId: '2025990003',
    email: 'admin@xiaoqiu.demo',
    avatarUrl: '/api/media/demo/portraits/10.jpg',
    verificationLevel: VerificationLevel.STAFF_VERIFIED,
    roles: [
      { role: Role.ORGANIZATION_ADMIN, scope: 'ORGANIZATION' },
      { role: Role.TOURNAMENT_ADMIN, scope: 'TOURNAMENT' },
    ],
    primaryTeamIndex: 0,
    followedTeamIndexes: [1, 2, 3],
    bio: '本地演示赛事管理员，可查看赛事管理入口。',
  },
  {
    username: 'supporter',
    displayName: '北看台阿澄',
    realName: '许书澄',
    studentId: '2023990004',
    email: 'supporter@xiaoqiu.demo',
    avatarUrl: '/api/media/demo/portraits/11.jpg',
    verificationLevel: VerificationLevel.STUDENT_VERIFIED,
    roles: [],
    primaryTeamIndex: 4,
    followedTeamIndexes: [2, 5],
    bio: '常在北看台记录学院联赛的学生球迷。',
  },
  {
    username: 'analyst',
    displayName: '小满看数据',
    realName: '唐知遥',
    studentId: '2024990005',
    email: 'analyst@xiaoqiu.demo',
    avatarUrl: '/api/media/demo/portraits/12.jpg',
    verificationLevel: VerificationLevel.STUDENT_VERIFIED,
    roles: [],
    primaryTeamIndex: 7,
    followedTeamIndexes: [3, 8],
    bio: '喜欢做赛后数据笔记的普通用户。',
  },
  {
    username: 'winger',
    displayName: '远航八号',
    realName: DEMO_PLAYERS[11 * 14 + 7]!.displayName,
    studentId: DEMO_PLAYERS[11 * 14 + 7]!.studentId,
    email: 'winger@xiaoqiu.demo',
    avatarUrl: '/api/media/demo/portraits/08.jpg',
    verificationLevel: VerificationLevel.PLAYER_CONFIRMED,
    linkedTeamIndex: 11,
    linkedPlayerIndex: 7,
    roles: [],
    primaryTeamIndex: 11,
    followedTeamIndexes: [2],
    bio: '外院远航的演示球员账号，用于验证跨球队关联。',
  },
]

export const DEMO_POSTS: DemoPostDefinition[] = [
  {
    key: 'photo-official-trophy',
    type: PostType.OFFICIAL,
    audience: 'TOURNAMENT',
    title: '绿茵杯进行中',
    body: '绿茵杯是校园各学院之间的足球赛事。2026 赛季自 3 月 1 日开赛，16 支球队完成小组赛和八强后，目前处于半决赛：首场已经结束，另一场半决赛和决赛都还没踢。',
    imageUrl: '/api/media/demo/photos/02.webp',
    publishedAt: '2026-09-02T08:00:00+08:00',
  },
  {
    key: 'photo-official-awards',
    type: PostType.OFFICIAL,
    audience: 'TOURNAMENT',
    title: '半决赛还差一场',
    body: '首场半决赛已经结束，物院一队 2:1 战胜生科青藤，先拿到一个决赛席位。另一场半决赛定于 9 月 2 日 19:00，胜者将和物院一队踢决赛。',
    imageUrl: '/api/media/demo/photos/06.webp',
    publishedAt: '2026-09-01T21:40:00+08:00',
  },
  {
    key: 'photo-community-huddle',
    type: PostType.COMMUNITY,
    authorUsername: 'captain',
    body: '【照片分享示例】把手叠在一起，带着同一个目标走上球场。',
    imageUrl: '/api/media/demo/photos/04.webp',
    publishedAt: '2026-10-01T09:20:00+08:00',
  },
  {
    key: 'photo-community-lineup',
    type: PostType.COMMUNITY,
    authorUsername: 'player',
    body: '【照片分享示例】留一张开赛前的合影，记住一起踢球的时光。',
    imageUrl: '/api/media/demo/photos/03.webp',
    publishedAt: '2026-10-01T09:10:00+08:00',
  },
  {
    key: 'photo-community-celebration',
    type: PostType.COMMUNITY,
    authorUsername: 'student',
    body: '【照片分享示例】欢呼、笑声和并肩作战的伙伴，都是校园足球的一部分。',
    imageUrl: '/api/media/demo/photos/05.webp',
    publishedAt: '2026-10-01T09:05:00+08:00',
  },
  {
    key: 'official-round-two',
    type: PostType.OFFICIAL,
    audience: 'PLATFORM',
    title: '招募信息管理员',
    body: '晓球正在招募信息管理员，负责核对比赛事件、名单和页面上的公开信息。这是平台招募，不是某一届赛事的主办通知。',
    publishedAt: '2026-10-06T09:00:00+08:00',
  },
  {
    key: 'official-venue',
    type: PostType.OFFICIAL,
    audience: 'PLATFORM',
    title: '赛程和数据页已更新',
    body: '平台近期上线了更紧凑的赛程浏览和数据页。比赛对阵和比分仍以赛事主办方公布的内容为准。',
    publishedAt: '2026-10-04T09:00:00+08:00',
  },
  {
    key: 'platform-suggestions',
    type: PostType.OFFICIAL,
    audience: 'PLATFORM',
    title: '欢迎提出使用建议',
    body: '如果比分看不清、球员找不到，或你希望晓球多一个功能，可以通过站内反馈告诉平台。建议只用于改进产品，不会改写比赛记录。',
    publishedAt: '2026-10-02T09:00:00+08:00',
  },
  {
    key: 'community-derby',
    type: PostType.COMMUNITY,
    authorUsername: 'student',
    body: '第一次现场看物院德比，双方从开场就把节奏拉满。看台上的气氛也很棒，期待下一轮！',
    publishedAt: '2026-08-24T20:10:00+08:00',
  },
  {
    key: 'community-training',
    type: PostType.COMMUNITY,
    authorUsername: 'captain',
    body: '完成小组赛后的恢复训练。进入淘汰赛以后每个细节都更重要，感谢到场支持我们的同学。',
    publishedAt: '2026-08-30T21:15:00+08:00',
  },
  {
    key: 'community-reporter',
    type: PostType.COMMUNITY,
    authorUsername: 'reporter',
    body: '第二场半决赛信息台将在开赛前 30 分钟开放。首场半决赛评分与比赛事件已经可以在详情页查看。',
    publishedAt: '2026-09-01T22:10:00+08:00',
  },
  {
    key: 'community-player',
    type: PostType.COMMUNITY,
    authorUsername: 'player',
    body: '进球当然开心，但更重要的是全队一起完成了赛前部署。下一场见。',
    publishedAt: '2026-08-29T10:05:00+08:00',
  },
  {
    key: 'official-photo-note',
    type: PostType.OFFICIAL,
    audience: 'TOURNAMENT',
    title: '决赛档期已排定',
    body: '绿茵杯决赛和三四名赛都安排在 9 月 14 日。四强还没有全部产生，决赛对阵会在第二场半决赛结束后确定。',
    imageUrl: '/api/media/demo/photos/07.webp',
    publishedAt: '2026-08-28T10:00:00+08:00',
  },
  {
    key: 'community-night-album',
    type: PostType.COMMUNITY,
    authorUsername: 'student',
    body: '夜训结束，把球场、合影和庆祝的三张照片放在一起。灯光底下每个人的表情都不一样。',
    imageUrl: '/api/media/demo/album:04,03,05',
    publishedAt: '2026-10-08T21:10:00+08:00',
  },
  {
    key: 'community-wide-crop',
    type: PostType.COMMUNITY,
    authorUsername: 'reporter',
    title: '看台这一侧',
    body: '把一张现场照片裁成横幅，留给赛后回顾。',
    imageUrl: '/api/media/demo/photos/08.webp',
    publishedAt: '2026-10-07T18:40:00+08:00',
  },
  {
    key: 'community-tall-crop',
    type: PostType.COMMUNITY,
    authorUsername: 'player',
    body: '赛前合影裁成竖图。人比分数更值得留下来。',
    imageUrl: '/api/media/demo/photos/09.webp',
    publishedAt: '2026-10-06T12:15:00+08:00',
  },
  {
    key: 'community-day-album',
    type: PostType.COMMUNITY,
    authorUsername: 'captain',
    body: '一组白天的记录：举杯、颁奖，还有训练场边的一张。',
    imageUrl: '/api/media/demo/album:02,06,07',
    publishedAt: '2026-10-05T16:05:00+08:00',
  },
  {
    key: 'community-short-note',
    type: PostType.COMMUNITY,
    authorUsername: 'supporter',
    body: '北看台今天风很大，围巾都吹起来了。',
    publishedAt: '2026-10-04T19:25:00+08:00',
  },
  {
    key: 'community-long-note',
    type: PostType.COMMUNITY,
    authorUsername: 'analyst',
    body: '把最近四轮的射门位置对了一遍。物院一队的机会更多来自右路传中后的第二点，生科青藤则习惯在中场连续传导后再找肋部。演示数据只能说明赛程里已经录入的事件，不能代替教练组的复盘。下一轮如果场地还是东区，风向会继续影响长传落点。',
    publishedAt: '2026-10-03T11:20:00+08:00',
  },
  {
    key: 'community-banner-crop',
    type: PostType.COMMUNITY,
    authorUsername: 'winger',
    body: '远航这边留一张横图，训练结束就去吃饭。',
    imageUrl: '/api/media/demo/photos/10.webp',
    publishedAt: '2026-10-02T20:05:00+08:00',
  },
  {
    key: PLATFORM_WELCOME_POST_KEY,
    type: PostType.OFFICIAL,
    audience: 'PLATFORM',
    title: '欢迎来到晓球',
    body: PLATFORM_WELCOME_POST_BODY,
    // Earliest platform notice, so it sorts last in the 官方公告 rail and list.
    publishedAt: '2026-10-01T08:00:00+08:00',
    quiet: true,
  },
]

export function fixtureId(key: string): string {
  const hex = createHash('sha256').update(`xiaoqiu:${key}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function positionForIndex(index: number): PlayerPosition {
  if (index < 2) return PlayerPosition.GOALKEEPER
  if (index < 6) return PlayerPosition.DEFENDER
  if (index < 10) return PlayerPosition.MIDFIELDER
  return PlayerPosition.FORWARD
}

function secondaryPositionFor(position: PlayerPosition, index: number): PlayerPosition {
  if (position === PlayerPosition.GOALKEEPER) return PlayerPosition.GOALKEEPER
  if (position === PlayerPosition.DEFENDER)
    return index % 2 === 0 ? PlayerPosition.MIDFIELDER : PlayerPosition.DEFENDER
  if (position === PlayerPosition.MIDFIELDER)
    return index % 2 === 0 ? PlayerPosition.FORWARD : PlayerPosition.DEFENDER
  return PlayerPosition.MIDFIELDER
}

function positionLabel(position: PlayerPosition): string {
  switch (position) {
    case PlayerPosition.GOALKEEPER:
      return '门将'
    case PlayerPosition.DEFENDER:
      return '后卫'
    case PlayerPosition.MIDFIELDER:
      return '中场'
    case PlayerPosition.FORWARD:
      return '前锋'
  }
}

function styleForPosition(position: PlayerPosition): string {
  switch (position) {
    case PlayerPosition.GOALKEEPER:
      return '反应迅速，习惯主动指挥防线'
    case PlayerPosition.DEFENDER:
      return '对抗稳定，擅长判断第二落点'
    case PlayerPosition.MIDFIELDER:
      return '跑动覆盖积极，重视向前传递'
    case PlayerPosition.FORWARD:
      return '喜欢攻击防线身后，门前处理果断'
  }
}

function ratingsForPosition(
  position: PlayerPosition,
  index: number,
): DemoPlayerDefinition['ratings'] {
  const base =
    position === PlayerPosition.GOALKEEPER
      ? [28, 59, 40, 62, 80]
      : position === PlayerPosition.DEFENDER
        ? [45, 66, 56, 64, 77]
        : position === PlayerPosition.MIDFIELDER
          ? [62, 70, 73, 76, 64]
          : [77, 78, 73, 63, 42]
  const value = (offset: number) =>
    Math.min(93, Math.max(24, base[offset]! + ((index * (offset + 5) * 7) % 19) - 9))
  return {
    shooting: value(0),
    speed: value(1),
    dribbling: value(2),
    passing: value(3),
    defending: value(4),
  }
}

function match(
  code: string,
  title: string,
  tournament: '2025' | '2026',
  stage: 'GROUP' | 'KNOCKOUT',
  group: DemoMatchDefinition['group'],
  round: number,
  homeTeamIndex: number | undefined,
  awayTeamIndex: number | undefined,
  status: MatchStatus,
  scheduledStartAt: string,
  homeScore?: number,
  awayScore?: number,
  summary?: string,
  attendance?: number,
  homePenaltyScore?: number,
  awayPenaltyScore?: number,
  statusReason?: string,
): DemoMatchDefinition {
  return {
    code,
    title,
    tournament,
    stage,
    group,
    round,
    homeTeamIndex,
    awayTeamIndex,
    status,
    scheduledStartAt,
    homeScore,
    awayScore,
    homePenaltyScore,
    awayPenaltyScore,
    statusReason,
    summary,
    attendance,
  }
}
