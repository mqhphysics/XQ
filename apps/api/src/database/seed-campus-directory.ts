import assert from 'node:assert/strict'
import { createHash, randomInt } from 'node:crypto'
import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { PrismaClient, type Prisma, type StudentRecord } from '../generated/prisma/client'
import { hashPassword } from '../auth/password'
import { sealAssignedPassword } from '../admin-center/admin-password-vault'

const COHORT = 'DEMO_2026'
const STUDENT_COUNT = 300
const USER_COUNT = 30
const catalog = [
  ['FRESHMEN_MEN', '新生杯', 'MALE'],
  ['FRESHMEN_WOMEN', '新生杯', 'FEMALE'],
  ['CS_MEN', '计科杯', 'MALE'],
  ['CS_WOMEN', '计科杯', 'FEMALE'],
  ['GREEN_MEN', '绿茵杯', 'MALE'],
  ['GREEN_WOMEN', '绿茵杯', 'FEMALE'],
] as const
function id(org: string, key: string) {
  const b = createHash('sha256').update(`campus-v1:${org}:${key}`).digest().subarray(0, 16)
  b[6] = (b[6]! & 15) | 0x50
  b[8] = (b[8]! & 63) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
const surnames = [
  '林',
  '陈',
  '王',
  '李',
  '赵',
  '周',
  '徐',
  '郭',
  '何',
  '高',
  '胡',
  '吴',
  '张',
  '曹',
  '唐',
  '程',
]
const given = [
  '知夏',
  '予安',
  '星野',
  '嘉言',
  '清越',
  '子衡',
  '书宁',
  '景行',
  '若川',
  '以南',
  '望舒',
  '雨辰',
  '安禾',
  '晨曦',
  '思远',
  '云舟',
]
async function portrait(index: number, _name: string, directory: string) {
  const name = String(index + 1).padStart(2, '0'),
    xml = (value: string) => value
  const hue = (index * 47 + 31) % 360,
    skin = ['#e5b58f', '#f3cfaa', '#c98c65', '#e9bd97'][index % 4]!,
    hair = ['#293c30', '#3d3029', '#594035', '#233e3e', '#4d4531'][index % 5]!
  const hairPath =
    index % 3 === 0
      ? 'M63 99Q60 36 125 38Q189 38 190 100L165 75 150 91 126 67 97 89 75 79Z'
      : index % 3 === 1
        ? 'M61 103Q51 40 122 36Q193 36 192 101L173 80Q127 92 96 69L76 104Z'
        : 'M66 100Q49 38 126 40Q194 37 187 100L170 72 157 78 136 67 116 83 92 75 78 103Z'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="hsl(${hue},24%,88%)"/><path d="M35 256v-35q6-48 67-52h52q62 5 67 52v35" fill="hsl(${hue},30%,30%)"/><path d="m106 164 22 27 22-27v-26h-44" fill="${skin}"/><ellipse cx="128" cy="110" rx="${55 + (index % 5)}" ry="67" fill="${skin}"/><path d="${hairPath}" fill="${hair}"/><path d="M95 112h14m38 0h14" stroke="${hair}" stroke-width="4" stroke-linecap="round"/><path d="M115 141q13 ${8 + (index % 5)} 26 0" fill="none" stroke="#a26957" stroke-width="3" stroke-linecap="round"/><path d="m98 174 30 22 30-22" stroke="hsl(${hue},20%,78%)" fill="none" stroke-width="5"/><text x="128" y="235" text-anchor="middle" fill="#f5f4e8" font-size="22" font-family="Microsoft YaHei,sans-serif">${xml(name.slice(-2))}</text></svg>`
  const body = await sharp(Buffer.from(svg)).webp({ quality: 88 }).toBuffer()
  const hash = createHash('sha256').update(body).digest('hex')
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, `${hash}.webp`), body)
  return `/api/media/avatars/${hash}.webp`
}

/** Only an isolated database clone may run this seed. Shared databases use a reviewed import. */
export async function seedCampusDirectory(
  prisma: PrismaClient,
  organizationId: string,
  options: { databaseUrl: string; avatarDirectory: string },
) {
  const db = decodeURIComponent(new URL(options.databaseUrl).pathname.slice(1))
  assert.match(
    db,
    /^xiaoqiu_campus_(?:test|preview)_20261016$/,
    'Campus seed is restricted to the isolated reviewed databases',
  )
  const players = await prisma.playerProfile.findMany({
    where: { organizationId, sourceType: 'DEMO_FIXTURE', isDemo: true },
    orderBy: { id: 'asc' },
    include: {
      linkedUser: { select: { id: true } },
      teamMemberships: { where: { organizationId, status: 'ACTIVE' }, include: { team: true } },
    },
  })
  assert.equal(
    players.length,
    224,
    'Retain exactly the existing 224 fixture players; never invent or match them by name',
  )
  const green = await prisma.tournament.findFirst({
    where: { organizationId, tournamentCode: 'DEMO-GREEN-CUP-2026' },
    include: { season: true },
  })
  assert(green, 'Existing complete demonstration tournament is required')
  const rosters = await prisma.rosterSnapshot.findMany({
    where: { organizationId, tournamentId: green.id },
    include: { team: true, entries: { select: { playerProfileId: true } } },
  })
  const seasonTeams = new Map(
    rosters.flatMap((roster) =>
      roster.entries.map((entry) => [entry.playerProfileId, roster.team] as const),
    ),
  )
  const already = await prisma.studentRecord.count({ where: { organizationId, cohort: COHORT } })
  if (already) {
    assert.equal(already, STUDENT_COUNT)
    assert.equal(
      await prisma.user.count({
        where: { profileCohort: COHORT, studentRecord: { organizationId } },
      }),
      USER_COUNT,
    )
    return {
      students: STUDENT_COUNT,
      players: 224,
      users: USER_COUNT,
      created: false,
      accounts: [] as Array<{ id: string; name: string; username: string; password: string }>,
    }
  }
  const newAccounts: Array<{ id: string; name: string; username: string; password: string }> = []
  const photoNames = (await readdir(resolve(__dirname, '../../demo-media/photos')))
    .filter((name) => /^(0[1-9]|1[0-6])\.webp$/.test(name))
    .sort()
  assert(photoNames.length > 0, 'Default profile backgrounds must refer to real bundled images')
  const covers = photoNames.map((name) => `/api/media/demo/photos/${name}`)
  const avatarUrls = await Promise.all(
    Array.from({ length: USER_COUNT }, (_, i) =>
      portrait(i, players[i]?.displayName ?? given[i % given.length]!, options.avatarDirectory),
    ),
  )
  const result = await prisma.$transaction(
    async (tx) => {
      const definitions = []
      for (const [index, [code, cupName, gender]] of catalog.entries())
        definitions.push(
          await tx.competitionDefinition.upsert({
            where: { organizationId_code: { organizationId, code } },
            create: {
              id: id(organizationId, `competition:${code}`),
              organizationId,
              code,
              cupName,
              gender,
              name: cupName,
              sortOrder: index,
            },
            update: {},
          }),
        )
      const demoSeason = await tx.season.upsert({
        where: { organizationId_seasonCode: { organizationId, seasonCode: 'DEMO-CAMPUS' } },
        create: {
          id: id(organizationId, 'season:demo'),
          organizationId,
          seasonCode: 'DEMO-CAMPUS',
          name: '演示赛季',
          isDemo: true,
          sortOrder: 0,
        },
        update: {},
      })
      await tx.season.update({
        where: { id: green.seasonId },
        data: {
          name: '2026',
          isDemo: false,
          sortOrder: 10,
          startsOn: new Date('2026-01-01T00:00:00Z'),
          endsOn: new Date('2026-12-31T00:00:00Z'),
        },
      })
      await tx.tournament.update({
        where: { id: green.id },
        data: {
          competitionDefinitionId: definitions.find((c) => c.code === 'GREEN_MEN')!.id,
          // The complete 32-match fixture is demonstration content; the formal 2026 season
          // stays empty until it starts (its cups show 即将开赛).
          seasonId: demoSeason.id,
          name: '演示赛季 绿茵杯',
        },
      })
      const realCs = await tx.tournament.findFirst({
        where: { organizationId, name: { contains: '计科杯' }, id: { not: green.id } },
      })
      if (realCs)
        await tx.tournament.update({
          where: { id: realCs.id },
          data: { competitionDefinitionId: definitions.find((c) => c.code === 'CS_MEN')!.id },
        })
      for (const registration of await tx.teamRegistration.findMany({
        where: { organizationId, tournamentId: green.id },
        include: { team: true },
      })) {
        const team = registration.team
        await tx.teamRegistration.update({
          where: { id: registration.id },
          data: {
            teamProfileSnapshot: {
              name: team.name,
              shortName: team.shortName,
              collegeName: team.collegeName,
              description: team.description,
              motto: team.motto,
              crestUrl: team.crestUrl,
              primaryColor: team.primaryColor,
              secondaryColor: team.secondaryColor,
            },
          },
        })
      }
      const students: StudentRecord[] = []
      for (let i = 0; i < STUDENT_COUNT; i++) {
        const player = players[i]
        const student = await tx.studentRecord.create({
          data: {
            id: id(organizationId, `student:${player?.id ?? i}`),
            organizationId,
            realName:
              player?.displayName ??
              `${surnames[(i - 224) % surnames.length]}${given[Math.floor((i - 224) / surnames.length) % given.length]}`,
            studentNumber: `99${String(i + 1).padStart(8, '0')}`,
            gender: i < 224 ? 'MALE' : i % 2 ? 'FEMALE' : 'MALE',
            collegeName:
              (player ? seasonTeams.get(player.id)?.collegeName : undefined) ??
              ['计算机学院', '物理学院', '生命科学学院', '文学院'][i % 4]!,
            academicYear: player?.academicYear ?? '2026级',
            cohort: COHORT,
            isDemo: true,
            sourceType: 'DEMO_FIXTURE',
          },
        })
        students.push(student)
        if (player) {
          await tx.playerProfile.update({
            where: { id: player.id },
            data: {
              studentRecordId: student.id,
              studentId: student.studentNumber,
              studentIdMasked: `99****${String(i + 1)
                .padStart(2, '0')
                .slice(-2)}`,
              coverUrl: covers[i % covers.length]!,
              avatarUrl: player.avatarUrl ?? player.portraitUrl,
              position: player.position ?? 'MIDFIELDER',
              dominantFoot: player.dominantFoot ?? 'RIGHT',
              academicYear: player.academicYear ?? '2026级',
              major: player.major ?? '本科',
              hometown: player.hometown ?? '校内演示资料',
              bio: player.bio ?? '校园足球球员基础资料',
              ratingShooting: player.ratingShooting ?? 60 + (i % 30),
              ratingSpeed: player.ratingSpeed ?? 65 + (i % 25),
              ratingDribbling: player.ratingDribbling ?? 60 + (i % 30),
              ratingPassing: player.ratingPassing ?? 65 + (i % 25),
              ratingDefending: player.ratingDefending ?? 55 + (i % 35),
            },
          })
          if (player.linkedUser)
            await tx.user.update({
              where: { id: player.linkedUser.id },
              data: {
                studentRecordId: student.id,
                realName: student.realName,
                realNameNormalized: student.realName.toLowerCase(),
                studentId: student.studentNumber,
                studentVerifiedAt: new Date(),
              },
            })
        }
      }
      const freePlayers = players.filter((p) => !p.linkedUser)
      const chosen: typeof freePlayers = []
      const target = freePlayers.find((p) => p.displayName === '郑明澈')
      if (target) chosen.push(target)
      const teamIds = [...new Set(rosters.map((r) => r.teamId))]
      for (const teamId of teamIds) {
        if (chosen.some((p) => seasonTeams.get(p.id)?.id === teamId)) continue
        const person = freePlayers.find(
          (p) => !chosen.some((c) => c.id === p.id) && seasonTeams.get(p.id)?.id === teamId,
        )
        if (person) chosen.push(person)
      }
      for (const player of freePlayers) {
        if (chosen.length >= 20) break
        if (!chosen.some((p) => p.id === player.id)) chosen.push(player)
      }
      assert.equal(chosen.length, 20)
      const chosenStudents = [
        ...chosen.map((p) => students[players.findIndex((s) => s.id === p.id)]!),
        ...students.slice(224, 234),
      ]
      for (const [index, student] of chosenStudents.entries()) {
        const player = players.find(
          (p) =>
            p.studentRecordId === student.id ||
            id(organizationId, `student:${p.id}`) === student.id,
        )
        const username = `demo${student.studentNumber}`
        const password = randomInt(100000, 1000000).toString(),
          digest = hashPassword(password)
        const user = await tx.user.create({
          data: {
            id: id(organizationId, `user:${student.id}`),
            studentRecordId: student.id,
            profileCohort: COHORT,
            studentVerifiedAt: new Date(),
            realName: student.realName,
            realNameNormalized: student.realName.toLowerCase(),
            studentId: student.studentNumber,
            displayName: student.realName,
            loginNameNormalized: username,
            email: `${username}@demo.xiaoqiu.invalid`,
            bio: [
              '喜欢校园足球，期待每一场比赛。',
              '记录绿茵时光，也认识并肩同行的伙伴。',
              '课余到球场走走，认真对待每一次配合。',
            ][index % 3]!,
            avatarUrl: avatarUrls[index]!,
            coverUrl: covers[index % covers.length]!,
            verificationLevel: 'STUDENT_VERIFIED',
            playerProfileId: player?.id ?? null,
            memberships: { create: { organizationId, status: 'ACTIVE', joinedAt: new Date() } },
            passwordCredential: {
              create: {
                passwordHash: digest.hash,
                passwordSalt: digest.salt,
                algorithm: digest.algorithm,
              },
            },
          },
        })
        const credential = { passwordHash: digest.hash, passwordSalt: digest.salt }
        const sealed = await sealAssignedPassword(
          password,
          credential,
          `${organizationId}:${user.id}`,
        )
        await tx.auditLog.create({
          data: {
            organizationId,
            actorType: 'IMPORT_BATCH',
            action: 'ADMIN_LOGIN_PASSWORD_ASSIGNED',
            targetType: 'User',
            targetId: user.id,
            reason: 'DEMO_FIXTURE 演示账号初始化',
            requestId: 'campus-seed-v1',
            source: 'DEMO_FIXTURE',
            afterSummary: sealed as unknown as Prisma.InputJsonValue,
          },
        })
        newAccounts.push({ id: user.id, name: student.realName, username, password })
        let role: 'MATCH_REPORTER' | 'TEAM_COACH' | 'TOURNAMENT_ADMIN' | 'TEAM_CAPTAIN' | null =
            null,
          scopeType: 'MATCH' | 'TOURNAMENT' | 'TEAM' = 'TOURNAMENT',
          scopeId = green.id
        if (index === 20 || index === 21) role = 'MATCH_REPORTER'
        else if (index === 22 || index === 23) {
          role = 'TEAM_COACH'
          scopeType = 'TEAM'
          scopeId = teamIds[index - 22]!
        } else if (index === 24) role = 'TOURNAMENT_ADMIN'
        else if (player && seasonTeams.has(player.id) && index < 16) {
          role = 'TEAM_CAPTAIN'
          scopeType = 'TEAM'
          scopeId = seasonTeams.get(player.id)!.id
        }
        // Keep an existing captain appointment rather than appointing a second demo captain.
        if (
          role === 'TEAM_CAPTAIN' &&
          (await tx.roleAssignment.findFirst({
            where: { organizationId, role, scopeType: 'TEAM', scopeId, revokedAt: null },
            select: { id: true },
          }))
        )
          role = null
        if (role)
          await tx.roleAssignment.create({
            data: { organizationId, userId: user.id, role, scopeType, scopeId },
          })
        if (role === 'MATCH_REPORTER') {
          const profile = await tx.reporterProfile.create({
            data: { organizationId, userId: user.id },
          })
          await tx.reporterScoreEntry.create({
            data: {
              organizationId,
              profileId: profile.id,
              deduplicationKey: `initial:${profile.id}`,
              kind: 'INITIAL',
              delta: 0,
              scoreBefore: 100,
              scoreAfter: 100,
              reason: '信息员初始记录质量分100（演示）',
            },
          })
        }
      }
      // Existing non-player accounts retain all credentials. Unverifiable legacy owner data stays explicit.
      const unlinked = await tx.user.findMany({
        where: { studentRecordId: null, memberships: { some: { organizationId } } },
        select: {
          id: true,
          displayName: true,
          loginNameNormalized: true,
          passwordCredential: { select: { id: true } },
        },
      })
      let fixturePerson = 234
      for (const user of unlinked) {
        const student =
          !user.passwordCredential && fixturePerson < STUDENT_COUNT
            ? students[fixturePerson++]
            : await tx.studentRecord.create({
                data: {
                  id: id(organizationId, `legacy-student:${user.id}`),
                  organizationId,
                  realName: user.displayName,
                  studentNumber: null,
                  status: 'PENDING',
                  sourceType: 'LEGACY_ACCOUNT_UNVERIFIED',
                  cohort: 'LEGACY',
                  isDemo: false,
                },
              })
        await tx.user.update({
          where: { id: user.id },
          data: {
            studentRecordId: student!.id,
            ...(!user.passwordCredential
              ? {
                  realName: student!.realName,
                  realNameNormalized: student!.realName.toLowerCase(),
                  studentId: student!.studentNumber,
                }
              : {}),
          },
        })
      }
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: 'IMPORT_BATCH',
          action: 'CAMPUS_DEMO_DIRECTORY_INITIALIZED',
          targetType: 'Organization',
          targetId: organizationId,
          reason: '用户授权300名演示学生、保留224名球员并准备30个完整演示账号；旧记录保留',
          requestId: 'campus-seed-v1',
          source: 'DEMO_FIXTURE',
          afterSummary: {
            students: 300,
            players: 224,
            newDemoAccounts: 30,
            preservedLegacyAccounts: true,
          },
        },
      })
      return { students: 300, players: 224, users: 30, created: true, accounts: newAccounts }
    },
    { timeout: 120000, isolationLevel: 'Serializable' },
  )
  return result
}
