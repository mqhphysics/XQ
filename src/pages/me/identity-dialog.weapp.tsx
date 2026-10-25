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
  const [kind, setKind] = useState<IdentityKind>('STUDENT'),
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
    if (message.trim().length < 8) {
      setError('请填写至少 8 个字的申请说明')
      return
    }
    if (['TEAM_CAPTAIN', 'TEAM_COACH'].includes(kind) && !teamId) {
      setError('请选择所属球队')
      return
    }
    const body = { kind, ...(teamId ? { teamId } : {}), message: message.trim() }
    const fingerprint = JSON.stringify(body)
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: identityActionId() }
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await identityRepository.apply(body, pending.current.key)
      pending.current = null
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
  const kinds = Object.entries(identityLabels)
  return (
    <NativeDialog
      title="身份与认证"
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
                  try {
                    await identityRepository.confirm(
                      record.id,
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
                确认已核实身份
              </Button>
            </View>
          ))}
          <View className="native-select-row">
            <Text>申请身份</Text>
            <Picker
              mode="selector"
              range={kinds.map((item) => item[1])}
              value={Math.max(
                0,
                kinds.findIndex((item) => item[0] === kind),
              )}
              onChange={(event) => {
                setKind(kinds[Number(event.detail.value)]![0] as IdentityKind)
                setTeamId('')
              }}
            >
              <View className="native-select">
                <Text>{identityLabels[kind]}</Text>
                <Text>⌄</Text>
              </View>
            </Picker>
          </View>
          {['TEAM_CAPTAIN', 'TEAM_COACH'].includes(kind) && (
            <View className="native-select-row">
              <Text>所属球队</Text>
              <Picker
                mode="selector"
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
