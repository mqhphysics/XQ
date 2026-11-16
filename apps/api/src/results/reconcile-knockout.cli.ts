import 'reflect-metadata'
import { parseArgs } from 'node:util'
import { isUUID } from 'class-validator'
import { NestFactory } from '@nestjs/core'
import { ResultsModule } from './results.module'
import { ResultsService } from './results.service'

async function main() {
  const { values } = parseArgs({
    options: {
      organization: { type: 'string' },
      tournament: { type: 'string' },
      target: { type: 'string', multiple: true },
      'apply-hash': { type: 'string' },
    },
  })
  const { organization, tournament, target, 'apply-hash': hash } = values
  if (
    !organization ||
    !isUUID(organization) ||
    !tournament ||
    !isUUID(tournament) ||
    !target?.length ||
    target.length > 8 ||
    target.some((code) => !/^[A-Za-z0-9_-]{1,64}$/.test(code)) ||
    (hash !== undefined && !/^[a-f0-9]{64}$/.test(hash))
  )
    throw new Error(
      '用法: --organization UUID --tournament UUID --target 场次代码 [--target 场次代码] [--apply-hash 预览哈希]',
    )
  const app = await NestFactory.createApplicationContext(ResultsModule, { logger: false })
  try {
    console.log(
      JSON.stringify(
        await app
          .get(ResultsService)
          .reconcileKnockoutSlots(organization, tournament, target, hash),
      ),
    )
  } finally {
    await app.close()
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
