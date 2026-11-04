import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common'

import { createWorkerRuntime, type WorkerRuntime } from './worker-runtime'

@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name)
  private runtime: WorkerRuntime | undefined

  async onApplicationBootstrap(): Promise<void> {
    this.runtime = createWorkerRuntime(process.env, (code) => this.logger.error(code))
    try {
      await this.runtime.start()
    } catch {
      await this.runtime.stop()
      throw new Error('WORKER_START_FAILED')
    }
    this.logger.log('Worker consuming confirmed match reports')
  }

  async onModuleDestroy(): Promise<void> {
    await this.runtime?.stop()
  }
}
