import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../overlay-focus'
import { listTestRoles, switchTestRole, type TestRole } from '../../features/product/test-role.h5'
import './test-role-dialog.h5.scss'

export function TestRoleDialog({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Array<{ id: TestRole; label: string }>>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useOverlayFocus(true, '.test-role-dialog', onClose)
  useEffect(() => {
    let active = true
    void listTestRoles().then(
      (response) => {
        if (active) setItems(response.items)
      },
      (issue) => {
        if (active) setError(issue instanceof Error ? issue.message : '无法读取测试角色')
      },
    )
    return () => {
      active = false
    }
  }, [])
  const choose = async (role: TestRole) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await switchTestRole(role)
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '切换失败，请重试')
      setBusy(false)
    }
  }
  return createPortal(
    <div
      className="test-role-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="test-role-dialog xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-role-title"
        aria-busy={busy}
      >
        <header className="xq-dialog__header">
          <h2 id="test-role-title">切换测试角色</h2>
          <button aria-label="关闭角色选择" disabled={busy} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="xq-dialog__body">
          <p>切换后以所选身份操作模拟赛事，修改会保存。</p>
          {error && <p role="alert">{error}</p>}
          {!items.length && !error && <p role="status">正在读取角色…</p>}
          <div className="test-role-options">
            {items.map((item) => (
              <button key={item.id} disabled={busy} onClick={() => void choose(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
