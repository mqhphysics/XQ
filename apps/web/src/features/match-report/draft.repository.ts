import Taro from '@tarojs/taro'
import { isFields, isRecord } from './repository'
import type { LocalReportDraft } from './types'

export function draftKey(organizationId: string, userId: string, matchId: string): string {
  return ['xiaoqiu.match-report.draft.v2', organizationId, userId, matchId]
    .map(encodeURIComponent)
    .join(':')
}

export function readDraft(key: string): LocalReportDraft | null {
  try {
    const value: unknown = Taro.getStorageSync(key)
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !Number.isSafeInteger(value.baseVersion) ||
      Number(value.baseVersion) < 0 ||
      !isFields(value.fields) ||
      typeof value.reason !== 'string' ||
      typeof value.savedAt !== 'string'
    )
      return null
    if (value.pending !== null) {
      const pending = value.pending
      if (
        !isRecord(pending) ||
        typeof pending.clientActionId !== 'string' ||
        !pending.clientActionId ||
        !Number.isSafeInteger(pending.expectedVersion) ||
        Number(pending.expectedVersion) < 0 ||
        !['SAVE', 'SUBMIT', 'RETURN', 'CONFIRM', 'CORRECT', 'COMPLETE', 'SAVE_SCORE'].includes(
          String(pending.action),
        ) ||
        typeof pending.reason !== 'string' ||
        !isFields(pending.fields)
      )
        return null
    }
    return value as unknown as LocalReportDraft
  } catch {
    return null
  }
}

export function writeDraft(key: string, draft: LocalReportDraft): boolean {
  try {
    Taro.setStorageSync(key, draft)
    return true
  } catch {
    return false
  }
}
export function removeDraft(key: string): boolean {
  try {
    Taro.removeStorageSync(key)
    return true
  } catch {
    return false
  }
}
