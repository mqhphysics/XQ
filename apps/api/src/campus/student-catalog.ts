/** Official CCNU academic units, checked against the university directory on 2026-10-23. */
export const COLLEGE_DIRECTORY_SOURCE = 'https://www.ccnu.edu.cn/jgsz/xbxy_s_zx_.htm'
export const CCNU_COLLEGES = [
  '人工智能教育学部',
  '教育学院',
  '心理学院',
  '文学院',
  '新闻传播学院',
  '历史文化学院',
  '马克思主义学院',
  '经济与工商管理学院',
  '公共管理学院',
  '法学院',
  '社会学院',
  '外国语学院',
  '信息管理学院',
  '体育学院',
  '音乐学院',
  '美术学院',
  '数学与统计学学院',
  '物理科学与技术学院',
  '化学学院',
  '生命科学学院',
  '计算机学院',
  '城市与环境科学学院',
  '国际文化交流学院',
  '政治与国际关系学院',
  '政治学与国家治理研究院',
  '中国农村研究院',
  '语言与语言教育研究中心',
  '中国近代史研究所',
  '国家文化产业研究中心',
  '区域与国别研究院',
] as const

const aliases: Record<string, (typeof CCNU_COLLEGES)[number]> = {
  物理学院: '物理科学与技术学院',
  物理科学与技术: '物理科学与技术学院',
  '物理科学与...（截断）': '物理科学与技术学院',
  物理科学技术学院: '物理科学与技术学院',
  马院: '马克思主义学院',
  数统: '数学与统计学学院',
  数学学院: '数学与统计学学院',
  城环: '城市与环境科学学院',
  城环学院: '城市与环境科学学院',
  城环青协: '城市与环境科学学院',
  教院: '教育学院',
  心院: '心理学院',
  历院: '历史文化学院',
  人工智能: '人工智能教育学部',
  新传: '新闻传播学院',
  信管: '信息管理学院',
  公共管理: '公共管理学院',
  体院: '体育学院',
  '体（体育学院）': '体育学院',
  法学院青协: '法学院',
}

export function canonicalCollege(value: string): string | null {
  const name = value.normalize('NFKC').trim()
  if (!name) return ''
  if ((CCNU_COLLEGES as readonly string[]).includes(name)) return name
  // NFKC also normalizes punctuation in imported labels.
  const match = Object.entries(aliases).find(([alias]) => alias.normalize('NFKC') === name)
  return match?.[1] ?? null
}

export function academicYearFromNumber(value: string | null | undefined): string {
  return value && /^20\d{8}$/.test(value) ? `${value.slice(0, 4)}级` : ''
}

export function studentCatalog() {
  const year = new Date().getFullYear()
  return {
    colleges: [...CCNU_COLLEGES],
    academicYears: Array.from({ length: year - 2000 + 1 }, (_, index) => `${year - index}级`),
    collegeSource: COLLEGE_DIRECTORY_SOURCE,
    checkedOn: '2026-10-23',
  }
}
