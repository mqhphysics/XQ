import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { readSession } from '../product/session'
import {
  TECHNICAL_TOTAL_KEYS,
  technicalId,
  technicalState,
  technicalTotals,
  emptyTechnicalTotals,
  type TechnicalOperation,
  type TechnicalTotals,
  type TechnicalWorkspace,
} from './repository.weapp'
type Fields = Record<keyof TechnicalTotals, string>
const strings = (totals: TechnicalTotals) => {
  const values = {} as Fields
  for (const key of TECHNICAL_TOTAL_KEYS) values[key] = String(totals[key])
  return values
}
const groups: Array<{ name: string; fields: Array<[keyof TechnicalTotals, string]> }> = [
  {
    name: '传球',
    fields: [
      ['passSuccess', '成功'],
      ['passFailure', '失败'],
    ],
  },
  {
    name: '抢断',
    fields: [
      ['tackleSuccess', '成功'],
      ['tackleFailure', '失败'],
    ],
  },
  {
    name: '过人',
    fields: [
      ['dribbleSuccess', '成功'],
      ['dribbleFailure', '失败'],
    ],
  },
  {
    name: '射门',
    fields: [
      ['shotsOnTarget', '射正（含进球）'],
      ['shotsOffTarget', '射偏'],
      ['goals', '进球'],
    ],
  },
  {
    name: '犯规与牌',
    fields: [
      ['fouls', '犯规'],
      ['yellowCards', '黄牌'],
      ['redCards', '红牌'],
    ],
  },
  {
    name: '绝佳机会',
    fields: [
      ['chancesCreated', '创造'],
      ['chancesMissed', '错失'],
    ],
  },
  { name: '角球', fields: [['corners', '全队角球']] },
]
export function NativeTechnicalSummary({
  workspace,
  teamId,
  playerId,
  name,
  onSave,
}: {
  workspace: TechnicalWorkspace
  teamId: string
  playerId: string | null
  name: string
  onSave: (op: TechnicalOperation) => boolean | undefined
}) {
  const owner = useRef(readSession()?.user)
  const user = owner.current,
    key = `xiaoqiu:technical-form:v2:${user?.organizationId}:${user?.id}:${workspace.matchId}:${teamId}:${playerId || 'team'}`
  const base = technicalTotals(workspace.operations, teamId, playerId),
    fingerprint = JSON.stringify(base)
  const edited = useRef(false)
  const [values, setValues] = useState<Fields>(() => {
    try {
      const saved = Taro.getStorageSync<{ values: Fields }>(key)
      if (
        saved?.values &&
        TECHNICAL_TOTAL_KEYS.every(
          (k) =>
            typeof saved.values[k] === 'string' ||
            (k === 'corners' && saved.values[k] === undefined),
        )
      ) {
        edited.current = true
        return { ...strings(base), ...saved.values }
      }
    } catch {
      /* Keep the available local/default value when device services are unavailable. */
    }
    return strings(base)
  })
  const [reason, setReason] = useState(() => {
      try {
        return Taro.getStorageSync<{ reason: string }>(key)?.reason || ''
      } catch {
        return ''
      }
    }),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false)
  const dirty = TECHNICAL_TOTAL_KEYS.some((k) => values[k] !== String(base[k])) || !!reason
  const reduced = TECHNICAL_TOTAL_KEYS.some((k) => Number(values[k]) < base[k])
  useEffect(() => {
    try {
      if (dirty && edited.current) Taro.setStorageSync(key, { values, reason })
      else Taro.removeStorageSync(key)
    } catch {
      setError('本机填写草稿保存失败，请保存汇总后再退出')
    }
  }, [values, reason, key, dirty])
  useEffect(() => {
    if (!edited.current) setValues(strings(base))
  }, [fingerprint])
  const save = () => {
    try {
      const totals = emptyTechnicalTotals()
      for (const key of TECHNICAL_TOTAL_KEYS) totals[key] = Number(values[key] || 0)
      const operation: TechnicalOperation = {
        id: technicalId(),
        occurredAt: new Date().toISOString(),
        kind: 'SET_TOTALS',
        teamId,
        playerId,
        totals,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }
      technicalState([...workspace.operations, operation])
      if (onSave(operation)) {
        edited.current = false
        setValues(strings(totals))
        setReason('')
        setError('')
        setSaved(true)
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '请检查填写数量')
    }
  }
  return (
    <View className="native-technical-form">
      <View className="native-technical-form__heading">
        <Text>
          {name} · {playerId ? '球员汇总' : '球队汇总'}
        </Text>
        <Text>
          {playerId ? '一次填写这名球员的所有项目' : '球队合计已包含球员记录，避免重复录入'}
        </Text>
      </View>
      {groups
        .filter((group) => !playerId || group.name !== '角球')
        .map((group) => (
          <View className="native-technical-form__group" key={group.name}>
            <Text>{group.name}</Text>
            <View
              className={`native-technical-form__fields${group.fields.length === 3 ? ' has-three' : ''}`}
            >
              {group.fields.map(([field, label]) => (
                <View key={field}>
                  <Text>{label}</Text>
                  <Input
                    type="number"
                    maxlength={6}
                    disabled={!workspace.canRecord}
                    value={values[field]}
                    placeholder="0"
                    onInput={(event) => {
                      if (/^\d{0,6}$/.test(event.detail.value)) {
                        edited.current = true
                        setValues((current) => ({ ...current, [field]: event.detail.value }))
                        setSaved(false)
                      }
                    }}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      {base.unclassifiedShots > 0 && (
        <View className="native-technical-form__legacy">
          <Text>旧记录中未分类的射门</Text>
          <Input
            type="number"
            maxlength={6}
            value={values.unclassifiedShots}
            disabled={!workspace.canRecord}
            onInput={(e) => {
              edited.current = true
              setValues((current) => ({ ...current, unclassifiedShots: e.detail.value }))
            }}
          />
        </View>
      )}
      {reduced && (
        <View className="native-technical-form__reason">
          <Text>修改说明</Text>
          <Input
            value={reason}
            maxlength={240}
            placeholder="减少数量时，简述校正原因"
            onInput={(e) => {
              edited.current = true
              setReason(e.detail.value)
            }}
          />
        </View>
      )}
      {error && <Text className="native-error">{error}</Text>}
      {saved && <Text className="native-note">汇总已保存</Text>}
      <View className="native-technical-form__actions">
        <Button
          onClick={() => {
            edited.current = false
            setValues(strings(base))
            setReason('')
            setError('')
            setSaved(false)
          }}
        >
          恢复已记录
        </Button>
        <Button disabled={!workspace.canRecord || !dirty} onClick={save}>
          保存全部
        </Button>
      </View>
    </View>
  )
}
