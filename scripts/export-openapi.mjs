import { createRequire } from 'node:module'
import console from 'node:console'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(resolve(repository, 'apps/api/package.json'))
require('reflect-metadata')
const { NestFactory } = require('@nestjs/core')
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger')
const { AppModule } = require(resolve(repository, 'apps/api/dist/app.module.js'))
const { version } = JSON.parse(
  await readFile(resolve(repository, 'apps/weapp/package.json'), 'utf8'),
)
// Build metadata only: do not listen, initialize services, or query a database.
const app = await NestFactory.create(AppModule, { logger: false })
try {
  app.setGlobalPrefix('api')
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('晓球 API').setVersion(version).addBearerAuth().build(),
  )
  const output = resolve(repository, 'packages/api-client/openapi.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(document, null, 2) + '\n')
  console.log('OpenAPI metadata exported without starting API or connecting to a database.')
} finally {
  await app.close()
}
