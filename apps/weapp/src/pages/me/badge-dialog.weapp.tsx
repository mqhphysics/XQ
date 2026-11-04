import { Button, Text, View } from '@tarojs/components'
import { useEffect, useRef, useState } from 'react'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { productRepository, createClientActionId } from '../../features/product/product.repository'
import { identityLabels } from '../../features/product/identity-badges'
import type { BadgePreferenceResponse } from '../../features/product/product.types'

export function NativeBadgeDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: (data: BadgePreferenceResponse) => void
}) {
  const [data, setData] = useState<BadgePreferenceResponse | null>(null),
    [choice, setChoice] = useState<string | null>(null)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const pending = useRef<{ choice: string | null; key: string } | null>(null)
  useEffect(() => {
    let active = true
    void productRepository
      .getBadgePreference()
      .then((value) => {
        if (active) {
          setData(value)
          setChoice(value.preferredKind)
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [])
  const save = async () => {
    if (!data || busy) return
    setBusy(true)
    setError('')
    if (!pending.current || pending.current.choice !== choice)
      pending.current = { choice, key: createClientActionId('badge') }
    try {
      const updated = await productRepository.setBadgePreference(
        choice,
        data.version,
        pending.current.key,
      )
      onSaved(updated)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <NativeDialog
      title="展示标志"
      compact
      onClose={onClose}
      busy={busy}
      footer={
        <Button
          className="native-button native-button--primary"
          disabled={!data || busy}
          loading={busy}
          onClick={() => void save()}
        >
          保存
        </Button>
      }
    >
      {!data && !error && <Text className="native-note">正在读取标志…</Text>}
      {data && (
        <View>
          <Button className="native-menu-row" onClick={() => setChoice(null)}>
            <Text>自动选择</Text>
            <Text className="native-menu-row__value">{choice === null ? '✓' : ''}</Text>
          </Button>
          {data.availableKinds.map((kind) => (
            <Button className="native-menu-row" key={kind} onClick={() => setChoice(kind)}>
              <View className={`native-badge native-badge--${kind}`}>
                <View className="native-badge__icon" />
              </View>
              <Text>{identityLabels[kind]}</Text>
              <Text className="native-menu-row__value">{choice === kind ? '✓' : ''}</Text>
            </Button>
          ))}
        </View>
      )}
      {error && <Text className="native-error">{error}</Text>}
    </NativeDialog>
  )
}
