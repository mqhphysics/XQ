import Taro from '@tarojs/taro'

import {
  cloneFields,
  type QuickReportFields,
  type QuickReportServerSnapshot,
  type SubmitQuickReportResult,
} from './quick-report.logic'

const MOCK_DELAY_MS = 360
const MOCK_STORAGE_PREFIX = 'spike:quick-report-server'

export type MockNetworkMode = 'ONLINE' | 'FAIL_SUBMIT'

export interface SubmitQuickReportInput {
  matchId: string
  expectedVersion: number
  fields: QuickReportFields
}

export interface QuickReportRepository {
  fetch(matchId: string): Promise<QuickReportServerSnapshot>
  submit(input: SubmitQuickReportInput): Promise<SubmitQuickReportResult>
  simulateRemoteChange(matchId: string): Promise<QuickReportServerSnapshot>
  reset(matchId: string): Promise<QuickReportServerSnapshot>
  setNetworkMode(mode: MockNetworkMode): void
  getNetworkMode(): MockNetworkMode
}

export class MockNetworkError extends Error {
  constructor() {
    super('模拟网络不可用')
    this.name = 'MockNetworkError'
  }
}

export class MockVersionConflictError extends Error {
  readonly current: QuickReportServerSnapshot

  constructor(current: QuickReportServerSnapshot) {
    super('服务端版本已变化')
    this.name = 'MockVersionConflictError'
    this.current = current
  }
}

class TaroMockQuickReportRepository implements QuickReportRepository {
  private networkMode: MockNetworkMode = 'ONLINE'

  async fetch(matchId: string): Promise<QuickReportServerSnapshot> {
    await delay()
    return this.read(matchId)
  }

  async submit(input: SubmitQuickReportInput): Promise<SubmitQuickReportResult> {
    await delay()

    if (this.networkMode === 'FAIL_SUBMIT') {
      throw new MockNetworkError()
    }

    const current = await this.read(input.matchId)
    if (current.version !== input.expectedVersion) {
      throw new MockVersionConflictError(current)
    }

    const submittedAt = new Date().toISOString()
    const updated: QuickReportServerSnapshot = {
      ...current,
      version: current.version + 1,
      fields: cloneFields(input.fields),
      updatedAt: submittedAt,
    }
    await this.write(updated)
    return {
      submissionId: `submission-${input.matchId}-${updated.version}`,
      submittedVersion: updated.version,
      submittedAt,
      snapshot: updated,
    }
  }

  async simulateRemoteChange(matchId: string): Promise<QuickReportServerSnapshot> {
    await delay()
    const current = await this.read(matchId)
    const updated: QuickReportServerSnapshot = {
      ...current,
      version: current.version + 1,
      fields: {
        ...cloneFields(current.fields),
        awayScore: current.fields.awayScore + 1,
        notes: '另一位信息员已补充客队进球，等待现场复核。',
      },
      updatedAt: new Date().toISOString(),
    }
    await this.write(updated)
    return updated
  }

  async reset(matchId: string): Promise<QuickReportServerSnapshot> {
    const snapshot = createInitialSnapshot(matchId)
    await this.write(snapshot)
    this.networkMode = 'ONLINE'
    return snapshot
  }

  setNetworkMode(mode: MockNetworkMode): void {
    this.networkMode = mode
  }

  getNetworkMode(): MockNetworkMode {
    return this.networkMode
  }

  private async read(matchId: string): Promise<QuickReportServerSnapshot> {
    try {
      const result = await Taro.getStorage<QuickReportServerSnapshot>({
        key: createServerKey(matchId),
      })
      return result.data
    } catch {
      const snapshot = createInitialSnapshot(matchId)
      await this.write(snapshot)
      return snapshot
    }
  }

  private async write(snapshot: QuickReportServerSnapshot): Promise<void> {
    await Taro.setStorage({
      key: createServerKey(snapshot.matchId),
      data: snapshot,
    })
  }
}

function createInitialSnapshot(matchId: string): QuickReportServerSnapshot {
  return {
    matchId,
    version: 3,
    homeTeamName: '绿茵学院',
    awayTeamName: '星火学院',
    fields: {
      homeScore: 1,
      awayScore: 0,
      outcome: 'FINISHED',
      goals: [{ id: 'server-goal-1', team: 'HOME', minute: 18, scorer: '7 号 陈昊' }],
      notes: '',
    },
    updatedAt: new Date().toISOString(),
  }
}

function createServerKey(matchId: string): string {
  return `${MOCK_STORAGE_PREFIX}:${matchId}`
}

function delay(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, MOCK_DELAY_MS)
  })
}

export const quickReportRepository: QuickReportRepository = new TaroMockQuickReportRepository()
