export type TeamNavDesignKey = '04' | '15'

interface Contour {
  key: string
  path: string
  seedPath?: string
  width: number
  tone: 'primary' | 'secondary' | 'detail'
  delay: number
  duration: number
  bodyPath?: string
  engravings?: readonly string[]
}

interface TeamNavDesign {
  key: TeamNavDesignKey
  name: string
  originY: number
  contours: readonly Contour[]
}

const scrollSeed = 'M100 66C89 75 77 78 64 78'
const grassSeed = 'M100 69C89 70 80 67 72 62'
const grassStem = `${grassSeed}C59 54 51 44 39 38`

// Rounded, scalloped acanthus edges with a tucked end, rather than an open V.
const innerFeather =
  'M53 52C56 56 62 59 68 60C67 65 72 68 73 72C75 77 68 79 63 75C61 73 58 70 56 67C56 72 52 69 50 65C47 62 48 57 49 53C50 51 51 51 53 52Z'
const middleFeather =
  'M39 41C44 42 49 45 54 48C51 55 53 64 58 69C61 73 56 77 52 74C49 73 46 70 44 66C44 72 40 68 38 64C37 68 33 63 32 59C30 62 27 57 28 53C25 52 26 47 28 39C31 38 35 39 39 41Z'
const outerFeather =
  'M27 33C32 34 37 36 41 39C38 46 40 53 44 57C47 62 42 65 38 61C35 59 33 56 32 52C32 57 28 54 27 51C26 54 22 50 22 47C19 49 18 44 19 40C17 37 21 32 27 33Z'
const curlFeather =
  'M16 34C21 33 25 34 27 37C24 40 25 45 29 48C32 51 28 54 25 51C22 49 20 47 20 44C18 47 15 44 15 41C12 42 11 38 13 36C14 35 15 34 16 34Z'

const innerGrain = Array.from({ length: 8 }, (_, i) => {
  const t = i / 7
  return `M${(52 + t * 14).toFixed(2)} ${(53 + t * 7).toFixed(2)}C${(49 + t * 12).toFixed(2)} ${(59 + t * 8).toFixed(2)} ${(53 + t * 12).toFixed(2)} ${(66 + t * 7).toFixed(2)} ${(59 + t * 11).toFixed(2)} ${(69 + t * 5).toFixed(2)}`
})
const middleGrain = Array.from({ length: 11 }, (_, i) => {
  const t = i / 10
  return `M${(29 + t * 22).toFixed(2)} ${(41 + t * 8).toFixed(2)}C${(27 + t * 22).toFixed(2)} ${(49 + t * 10).toFixed(2)} ${(31 + t * 22).toFixed(2)} ${(57 + t * 12).toFixed(2)} ${(35 + t * 19).toFixed(2)} ${(59 + t * 12).toFixed(2)}`
})
const outerGrain = Array.from({ length: 8 }, (_, i) => {
  const t = i / 7
  return `M${(21 + t * 18).toFixed(2)} ${(35 + t * 5).toFixed(2)}C${(19 + t * 16).toFixed(2)} ${(41 + t * 10).toFixed(2)} ${(23 + t * 15).toFixed(2)} ${(48 + t * 10).toFixed(2)} ${(26 + t * 14).toFixed(2)} ${(48 + t * 11).toFixed(2)}`
})

export const teamNavDesigns: Record<TeamNavDesignKey, TeamNavDesign> = {
  '04': {
    key: '04',
    name: '菱形卷线',
    originY: 66,
    contours: [
      {
        key: 'sweep',
        path: `${scrollSeed}C41 78 22 67 21 50C20 31 40 29 62 39C73 44 81 47 84 45`,
        seedPath: scrollSeed,
        width: 2.35,
        tone: 'primary',
        delay: 30,
        duration: 1050,
      },
      {
        key: 'crossing',
        path: 'M100 66C83 56 60 37 41 37C28 37 19 48 9 49C-2 50-1 36 8 31C19 24 32 29 32 38C32 46 24 48 20 45',
        width: 1.65,
        tone: 'secondary',
        delay: 180,
        duration: 1120,
      },
      {
        key: 'inner-curl',
        path: `${scrollSeed}C47 78 32 72 28 60C24 49 31 42 39 44C47 46 46 55 40 56C34 57 32 52 35 49`,
        width: 0.7,
        tone: 'detail',
        delay: 410,
        duration: 900,
      },
    ],
  },
  '15': {
    key: '15',
    name: '卷草细纹',
    originY: 69,
    contours: [
      {
        key: 'stem',
        path: `${grassStem}C22 26 5 32 3 49C1 66 24 70 28 57C31 46 15 42 12 51C10 59 19 64 22 56`,
        seedPath: grassSeed,
        width: 2.15,
        tone: 'secondary',
        delay: 30,
        duration: 1100,
      },
      {
        key: 'inner-scroll',
        path: `${grassSeed}C77 59 83 55 83 48C84 38 69 37 67 46C66 55 76 58 78 51C79 46 74 43 72 47`,
        width: 1.6,
        tone: 'primary',
        delay: 190,
        duration: 850,
      },
      {
        key: 'inner-feather',
        path: `${grassSeed}C65 58 60 54 53 52${innerFeather}`,
        bodyPath: innerFeather,
        engravings: [...innerGrain, 'M66 64C66 68 72 71 70 74C68 76 64 72 64 70'],
        width: 1.05,
        tone: 'primary',
        delay: 310,
        duration: 940,
      },
      {
        key: 'middle-feather',
        path: `${grassSeed}C60 55 49 45 39 41${middleFeather}`,
        bodyPath: middleFeather,
        engravings: [...middleGrain, 'M49 61C50 66 57 70 55 72C53 75 48 69 48 67'],
        width: 1.15,
        tone: 'secondary',
        delay: 420,
        duration: 980,
      },
      {
        key: 'outer-feather',
        path: `${grassStem}C33 34 30 33 27 33${outerFeather}`,
        bodyPath: outerFeather,
        engravings: [...outerGrain, 'M36 47C36 53 43 57 41 59C39 61 34 56 34 53'],
        width: 0.95,
        tone: 'primary',
        delay: 530,
        duration: 950,
      },
      {
        key: 'curl-feather',
        path: `${grassStem}C29 31 21 31 16 34${curlFeather}`,
        bodyPath: curlFeather,
        engravings: [
          'M16 36C13 40 21 45 23 47',
          'M19 35C17 39 23 45 26 48',
          'M22 35C20 40 26 45 28 48',
          'M24 39C23 44 27 48 27 50',
        ],
        width: 0.85,
        tone: 'secondary',
        delay: 600,
        duration: 920,
      },
      {
        key: 'edge',
        path: `${grassStem}C24 28 8 31 6 45C4 57 16 65 25 60`,
        width: 0.6,
        tone: 'detail',
        delay: 520,
        duration: 940,
        engravings: [
          'M7 44C6 36 17 33 25 38',
          'M6 48C6 39 15 35 22 38',
          'M7 52C4 44 9 37 16 37',
          'M9 58C4 53 4 45 7 40',
          'M14 62C7 59 5 52 6 48',
          'M21 62C14 65 8 61 7 57',
          'M25 58C22 62 17 62 14 60',
        ],
      },
    ],
  },
}
