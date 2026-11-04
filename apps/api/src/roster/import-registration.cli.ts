import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import { ERROR_CODES, type ErrorCode } from '@xiaoqiu/contracts'

import { PrismaClient } from '../generated/prisma/client'
import {
  RegistrationImportError,
  hashRegistrationSource,
  parseRegistrationImportDocument,
} from './registration-import.schema'
import { RegistrationImportService } from './registration-import.service'

interface CliArguments {
  file: string
  tournamentCode: string
  acknowledgeWarnings: boolean
}

async function main(): Promise<void> {
  let prisma: PrismaClient | undefined

  try {
    assertDevelopmentEnvironment()
    const args = parseArguments(process.argv.slice(2))
    const matchingSecret = process.env.REGISTRATION_IMPORT_HASH_SECRET

    if (matchingSecret === undefined || matchingSecret.trim().length < 16) {
      throw new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_INVALID, [
        'MATCHING_SECRET_REQUIRED',
      ])
    }

    const sourcePath = isAbsolute(args.file)
      ? args.file
      : resolve(process.env.INIT_CWD ?? process.cwd(), args.file)
    const source = await readFile(sourcePath)
    const document = parseRegistrationImportDocument(JSON.parse(source.toString('utf8')))
    prisma = new PrismaClient()
    const result = await new RegistrationImportService(prisma).import({
      document,
      sourceFileHash: hashRegistrationSource(source),
      tournamentCode: args.tournamentCode,
      acknowledgeWarnings: args.acknowledgeWarnings,
      matchingSecret,
    })

    console.log(
      JSON.stringify({
        batchId: result.batchId,
        teamCode: result.teamCode,
        playerCount: result.playerCount,
        warningCount: result.warningCount,
        result: result.result,
      }),
    )
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        code: safeErrorCode(error),
        result: 'FAILED',
      }),
    )
    process.exitCode = 1
  } finally {
    await prisma?.$disconnect()
  }
}

function assertDevelopmentEnvironment(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_NOT_ALLOWED)
  }
}

function parseArguments(values: string[]): CliArguments {
  let file: string | undefined
  let tournamentCode: string | undefined
  let acknowledgeWarnings = false

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]

    if (value === '--') {
      continue
    }

    if (value === '--acknowledge-warnings') {
      acknowledgeWarnings = true
      continue
    }

    if (value === '--file') {
      file = values[index + 1]
      index += 1
      continue
    }

    if (value === '--tournament-code') {
      tournamentCode = values[index + 1]
      index += 1
      continue
    }

    throw new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_INVALID, [
      'CLI_ARGUMENT_INVALID',
    ])
  }

  if (file === undefined || file.trim() === '') {
    throw new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_INVALID, [
      'CLI_FILE_REQUIRED',
    ])
  }

  if (tournamentCode === undefined || tournamentCode.trim() === '') {
    throw new RegistrationImportError(ERROR_CODES.REGISTRATION_IMPORT_INVALID, [
      'CLI_TOURNAMENT_CODE_REQUIRED',
    ])
  }

  return {
    file,
    tournamentCode: tournamentCode.trim(),
    acknowledgeWarnings,
  }
}

function safeErrorCode(error: unknown): ErrorCode {
  return error instanceof RegistrationImportError ? error.code : ERROR_CODES.INTERNAL_ERROR
}

void main()
