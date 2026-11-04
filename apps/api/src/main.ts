import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { configureApp } from './app.setup'
import { resolve } from 'node:path'
import { loadMailEnvironment } from './auth/mail-env'

async function bootstrap(): Promise<void> {
  loadMailEnvironment(resolve(__dirname, '../../..'))
  const app = await NestFactory.create(AppModule)

  configureApp(app)
  app.enableShutdownHooks()

  const port = Number(process.env.API_PORT ?? 3001)
  const host = process.env.API_HOST ?? '0.0.0.0'

  await app.listen(port, host)
}

void bootstrap()
