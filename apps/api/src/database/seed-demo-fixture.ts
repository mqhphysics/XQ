import type { PrismaClient } from '../generated/prisma/client'
import { DEMO_ORGANIZATION_ID, DEMO_PLAYERS, DEMO_TEAMS, fixtureId } from './demo-fixture'
import { seedDemoMatches, seedDemoRosters, seedDemoTournament } from './seed-demo-competition'
import { seedDemoAccountsAndCommunity } from './seed-demo-social'

export async function seedDemoFixture(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const organization = await tx.organization.upsert({
        where: { slug: 'xiaoqiu-dev' },
        create: {
          id: DEMO_ORGANIZATION_ID,
          slug: 'xiaoqiu-dev',
          name: '华师校园足球',
        },
        update: { name: '华师校园足球' },
      })

      const teams = []
      for (const [teamIndex, team] of DEMO_TEAMS.entries()) {
        const crestUrl = `/api/media/demo/crests/${String(teamIndex + 1).padStart(2, '0')}.png`
        teams.push(
          await tx.team.upsert({
            where: {
              organizationId_teamCode: {
                organizationId: organization.id,
                teamCode: team.code,
              },
            },
            create: {
              id: fixtureId(`team:${team.code}`),
              organizationId: organization.id,
              teamCode: team.code,
              name: team.name,
              shortName: team.shortName,
              collegeName: team.collegeName,
              description: team.description,
              motto: team.motto,
              primaryColor: team.primaryColor,
              secondaryColor: team.secondaryColor,
              crestUrl,
              foundedYear: team.foundedYear,
            },
            update: {
              name: team.name,
              shortName: team.shortName,
              collegeName: team.collegeName,
              description: team.description,
              motto: team.motto,
              primaryColor: team.primaryColor,
              secondaryColor: team.secondaryColor,
              crestUrl,
              foundedYear: team.foundedYear,
            },
          }),
        )
      }

      for (const player of DEMO_PLAYERS) {
        await tx.playerProfile.upsert({
          where: { id: player.id },
          create: {
            id: player.id,
            organizationId: organization.id,
            sourceType: 'DEMO_FIXTURE',
            sourceKey: player.sourceKey,
            displayName: player.displayName,
            jerseyName: player.jerseyName,
            studentId: player.studentId,
            studentIdMasked: maskStudentId(player.studentId),
            position: player.position,
            secondaryPosition: player.secondaryPosition,
            dominantFoot: player.dominantFoot,
            heightCm: player.heightCm,
            academicYear: player.academicYear,
            major: player.major,
            hometown: player.hometown,
            bio: player.bio,
            profileColor: player.profileColor,
            avatarUrl: player.portraitUrl,
            portraitUrl: player.portraitUrl,
            ratingShooting: player.ratings.shooting,
            ratingSpeed: player.ratings.speed,
            ratingDribbling: player.ratings.dribbling,
            ratingPassing: player.ratings.passing,
            ratingDefending: player.ratings.defending,
            isDemo: true,
          },
          update: {
            displayName: player.displayName,
            jerseyName: player.jerseyName,
            studentId: player.studentId,
            studentIdMasked: maskStudentId(player.studentId),
            position: player.position,
            secondaryPosition: player.secondaryPosition,
            dominantFoot: player.dominantFoot,
            heightCm: player.heightCm,
            academicYear: player.academicYear,
            major: player.major,
            hometown: player.hometown,
            bio: player.bio,
            profileColor: player.profileColor,
            portraitUrl: player.portraitUrl,
            ratingShooting: player.ratings.shooting,
            ratingSpeed: player.ratings.speed,
            ratingDribbling: player.ratings.dribbling,
            ratingPassing: player.ratings.passing,
            ratingDefending: player.ratings.defending,
            isDemo: true,
          },
        })
        await tx.playerProfile.updateMany({
          where: { id: player.id, organizationId: organization.id, avatarUrl: null },
          data: { avatarUrl: player.portraitUrl },
        })
      }

      const venues = [
        await tx.venue.upsert({
          where: {
            organizationId_venueCode: {
              organizationId: organization.id,
              venueCode: 'DEMO-YOUMING',
            },
          },
          create: {
            id: fixtureId('venue:youming'),
            organizationId: organization.id,
            venueCode: 'DEMO-YOUMING',
            name: '佑铭体育场',
            address: '校内主体育场',
          },
          update: { name: '佑铭体育场', address: '校内主体育场' },
        }),
        await tx.venue.upsert({
          where: {
            organizationId_venueCode: {
              organizationId: organization.id,
              venueCode: 'DEMO-EAST',
            },
          },
          create: {
            id: fixtureId('venue:east'),
            organizationId: organization.id,
            venueCode: 'DEMO-EAST',
            name: '东区足球场',
            address: '东区运动场 1 号场',
          },
          update: { name: '东区足球场', address: '东区运动场 1 号场' },
        }),
      ]

      const fixture2025 = await seedDemoTournament(tx, organization.id, '2025')
      const fixture2026 = await seedDemoTournament(tx, organization.id, '2026')
      await seedDemoRosters(tx, organization.id, fixture2025, teams)
      await seedDemoRosters(tx, organization.id, fixture2026, teams)
      await seedDemoMatches(
        tx,
        organization.id,
        { '2025': fixture2025, '2026': fixture2026 },
        teams,
        venues,
      )
      await seedDemoAccountsAndCommunity(tx, organization.id, fixture2026.id, teams)
    },
    { maxWait: 15_000, timeout: 120_000 },
  )
}

function maskStudentId(studentId: string): string {
  return `${studentId.slice(0, 4)}${'*'.repeat(Math.max(0, studentId.length - 6))}${studentId.slice(-2)}`
}
