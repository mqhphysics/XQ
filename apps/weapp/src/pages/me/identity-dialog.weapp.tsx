import { Button, Picker, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import {
  identityRepository,
  identityActionId,
  identityLabels,
  type IdentityKind,
  type IdentitySnapshot,
} from '../../features/identity/identity.repository.h5'
import { productConfigRepository } from '../../features/product-config/product-config.repository'
import { productRepository } from '../../features/product/product.repository'
import { readSession, saveSession } from '../../features/product/session'
import type { AuthUser } from '../../features/product/product.types'
import { gettingStartedEvent } from '../../features/getting-started/repository.weapp'

export function NativeIdentityDialog({
  user,
  onClose,
  onChanged,
}: {
  user: AuthUser
  onClose: () => void
  onChanged: (user: AuthUser) => void
}) {
  const [data, setData] = useState<IdentitySnapshot | null>(null),
    [error, setError] = useState('')
  const [kind, setKind] = useState<IdentityKind | ''>(''),
    [candidateId, setCandidateId] = useState(''),
    [teamId, setTeamId] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const pending = useRef<{ fingerprint: string; key: string } | null>(null)
  const lock = useRef(false),
    alive = useRef(true)
  const load = useCallback(async () => {
    setError('')
    try {
      const caps = await productConfigRepository.getCapabilities()
      if (!caps.actions['identityApplications.submit'].enabled)
        throw new Error(caps.actions['identityApplications.submit'].reason ?? '身份认证暂未开放')
      const snapshot = await identityRepository.get()
      if (alive.current) setData(snapshot)
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : '认证信息读取失败')
    }
  }, [])
  useEffect(() => {
    void load()
    return () => {
      alive.current = false
    }
  }, [load])
  const refreshUser = async () => {
    const current = readSession(),
      updated = await productRepository.getMe()
    if (
      current &&
      current.user.id === user.id &&
      readSession()?.accessToken === current.accessToken
    ) {
      saveSession({ ...current, user: updated })
      onChanged(updated)
    }
  }
  const submit = async () => {
    if (lock.current) return
    if (!kind) {
      setError('请选择要申请的身份，或选择一个匹配候选')
      return
    }
    if (message.trim().length < 8) {
      setError('请填写至少 8 个字的申请说明')
      return
    }
    if (['TEAM_CAPTAIN', 'TEAM_COACH'].includes(kind) && !teamId) {
      setError('请选择所属球队')
      return
    }
    const body = {
      kind,
      ...(candidateId ? { candidateId } : {}),
      ...(teamId ? { teamId } : {}),
      message: message.trim(),
    }
    const fingerprint = JSON.stringify(body)
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: identityActionId() }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await identityRepository.apply(body, pending.current.key)
      pending.current = null
      setCandidateId('')
      setKind('')
      setTeamId('')
      setMessage('')
      await load()
      void Taro.showToast({ title: '已提交，等待审核', icon: 'none' })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提交失败')
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const selfMatch = () => {
    onClose()
    Taro.eventCenter.trigger(gettingStartedEvent, 'match')
  }
  const kinds = Object.entries(identityLabels).filter(
    ([value]) => !['STUDENT', 'PLAYER', 'TEAM_CAPTAIN'].includes(value),
  )
  const staffCandidates =
    data?.candidates.filter(
      (candidate) => !['STUDENT', 'PLAYER', 'TEAM_CAPTAIN'].includes(candidate.kind),
    ) || []
  return (
    <NativeDialog
      title="身份管理"
      onClose={onClose}
      busy={busy}
      footer={
        data && (
          <Button
            className="native-button native-button--primary"
            disabled={busy}
            loading={busy}
            onClick={() => void submit()}
          >
            提交申请
          </Button>
        )
      }
    >
      <Button className="native-button native-button--primary" onClick={selfMatch}>
        {user.linkedPlayer ? '刷新球员与队长身份' : '自助关联球员身份'}
      </Button>
      <Text className="native-note">
        确认本人即可关联球员；队长身份依据已确认四官表自动识别，不需要提交人工申请。
      </Text>
      {error && <Text className="native-error">{error}</Text>}
      {!data && !error && <Text className="native-note">正在读取认证信息…</Text>}
      {!data && error && (
        <Button className="native-button" onClick={() => void load()}>
          重新加载
        </Button>
      )}
      {data && (
        <>
          {data.verifiedCandidates?.map((record) => (
            <View className="native-identity-record" key={record.id}>
              <Text>
                {identityLabels[record.kind]} · {record.displayName}
              </Text>
              <Text className="native-note">{record.teamName}</Text>
              <Button
                className="native-button"
                disabled={busy}
                onClick={async () => {
                  if (lock.current) return
                  lock.current = true
                  setBusy(true)
                  setError('')
                  try {
                    await identityRepository.confirm(
                      record.id.replace(/^record:/, ''),
                      record.expectedVersion,
                      identityActionId(),
                    )
                    await refreshUser()
                    await load()
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : '确认失败')
                  } finally {
                    lock.current = false
                    setBusy(false)
                  }
                }}
              >
                启用此身份
              </Button>
            </View>
          ))}
          {Boolean(staffCandidates.length) && (
            <>
              <Text className="native-section-title">其他工作人员任职</Text>
              <Text className="native-note">
                以下是教练、信息管理员等工作人员权限，按需申请，由组织授予。
              </Text>
              {staffCandidates
                .filter(
                  (candidate) =>
                    !data.verifiedCandidates?.some((verified) => verified.id === candidate.id),
                )
                .map((candidate) => (
                  <Button
                    key={candidate.id}
                    className={`native-button native-identity-candidate${candidateId === candidate.id ? ' is-selected' : ''}`}
                    disabled={busy}
                    onClick={() => {
                      setCandidateId(candidate.id)
                      setKind(candidate.kind)
                      setTeamId(candidate.teamId || '')
                      setError('')
                    }}
                  >
                    <Text>
                      {candidateId === candidate.id ? '✓ ' : ''}
                      {identityLabels[candidate.kind]} · {candidate.displayName}
                    </Text>
                    {candidate.teamName && (
                      <Text className="native-note">{candidate.teamName}</Text>
                    )}
                  </Button>
                ))}
              {data.hasMoreCandidates && (
                <Text className="native-note">
                  还有同名候选，可在申请说明中补充所属球队和具体身份。
                </Text>
              )}
            </>
          )}
          <View className="native-select-row">
            <Text>申请身份</Text>
            <Picker
              mode="selector"
              range={['请选择身份', ...kinds.map((item) => item[1])]}
              value={kinds.findIndex((item) => item[0] === kind) + 1}
              onChange={(event) => {
                setKind((kinds[Number(event.detail.value) - 1]?.[0] as IdentityKind) || '')
                setCandidateId('')
                setTeamId('')
              }}
            >
              <View className="native-select">
                <Text>{kind ? identityLabels[kind] : '请选择身份'}</Text>
                <Text>⌄</Text>
              </View>
            </Picker>
          </View>
          {['TEAM_CAPTAIN', 'TEAM_COACH'].includes(kind) && (
            <View className="native-select-row">
              <Text>所属球队</Text>
              <Picker
                mode="selector"
                disabled={Boolean(candidateId)}
                range={data.teams}
                rangeKey="name"
                onChange={(event) => setTeamId(data.teams[Number(event.detail.value)]?.id ?? '')}
              >
                <View className="native-select">
                  <Text>{data.teams.find((team) => team.id === teamId)?.name ?? '选择球队'}</Text>
                  <Text>⌄</Text>
                </View>
              </Picker>
            </View>
          )}
          <Text className="native-label">申请说明</Text>
          <Textarea
            className="native-field"
            maxlength={1000}
            value={message}
            placeholder="说明身份和所属球队，便于管理员核实"
            onInput={(event) => setMessage(event.detail.value)}
          />
          <Text className="native-section-title">申请记录</Text>
          {data.applications.map((item) => (
            <View className="native-identity-record" key={item.id}>
              <View>
                <Text>{identityLabels[item.kind]}</Text>
                <Text>
                  {{ PENDING: '待审核', APPROVED: '已通过', REJECTED: '未通过' }[item.status]}
                </Text>
              </View>
              {item.team && <Text className="native-note">{item.team.name}</Text>}
              {item.decisionNote && <Text className="native-note">{item.decisionNote}</Text>}
            </View>
          ))}
          {!data.applications.length && <Text className="native-note">暂无申请记录</Text>}
        </>
      )}
    </NativeDialog>
  )
}
