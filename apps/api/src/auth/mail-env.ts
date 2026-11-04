import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

export function loadMailEnvironment(repoRoot: string): void {
  const path = resolve(repoRoot, 'private-data/mail/.env.smtp')
  if (existsSync(path)) loadEnvFile(path)
}
