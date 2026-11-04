import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import { requestAdmin } from '../adminAuth/request'
import { requireAdminApi } from '../adminAuth/config'
import { refreshManagementData } from '../adminAuth/refresh'
import { DataState, Modal, useAdminData, message } from './shared'
import {
  purposeNames,
  providerPresets,
  type AiConfig,
  type AiProvider,
  type ReviewPolicy,
} from './ai-config'

export function AiProviderSettings({ context }: { context: OrganizationContext }) {
  const config = useAdminData<AiConfig>(context, '/admin/ai-review/config'),
    providers = useAdminData<{ items: AiProvider[] }>(context, '/admin/ai-review/providers')
  const [editing, setEditing] = useState<AiProvider | 'new' | null>(null),
    [rules, setRules] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('')
  const active = providers.data?.items.find((p) => p.id === config.data?.activeProfileId)
  async function activate(id: string) {
    setBusy(true)
    setNotice('')
    try {
      await requestAdmin(requireAdminApi(), context, `/admin/ai-review/providers/${id}/activate`, {
        method: 'POST',
        body: {},
      })
      refreshManagementData()
      setNotice('已切换AI服务')
    } catch (error) {
      setNotice(message(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <section className="mc-panel ai-settings-summary">
        <div>
          <h2>AI服务</h2>
          <p>
            {config.data?.enabled ? '自动审核已启用' : '自动审核未启用'}
            {active ? ` · ${active.name}` : ''}
          </p>
        </div>
        <div className="mc-actions">
          <select
            aria-label="当前AI服务"
            value={config.data?.activeProfileId ?? ''}
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) void activate(e.target.value)
            }}
          >
            <option value="" disabled>
              选择已保存连接
            </option>
            {providers.data?.items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setEditing('new')}>
            新增连接
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!active}
            onClick={() => active && setEditing(active)}
          >
            编辑连接
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!config.data}
            onClick={() => setRules(true)}
          >
            审核规则
          </button>
        </div>
        <DataState {...config} onRetry={config.refresh} />
        <DataState {...providers} onRetry={providers.refresh} />
        {notice && <p role="status">{notice}</p>}
      </section>
      {editing && (
        <Modal
          title={editing === 'new' ? '新增AI连接' : '编辑AI连接'}
          className="ai-provider-dialog"
          onClose={() => setEditing(null)}
        >
          <ProviderForm
            key={editing === 'new' ? 'new' : editing.id}
            context={context}
            initial={editing === 'new' ? null : editing}
            onSaved={async (provider) => {
              setEditing(provider)
              if (!config.data?.activeProfileId) await activate(provider.id)
              else refreshManagementData()
            }}
          />
        </Modal>
      )}
      {rules && config.data && (
        <Modal title="审核规则" className="ai-config-dialog" onClose={() => setRules(false)}>
          <RulesForm
            context={context}
            initial={config.data}
            onDone={() => {
              setRules(false)
              setNotice('审核规则已保存')
              refreshManagementData()
            }}
          />
        </Modal>
      )}
    </>
  )
}
function ProviderForm({
  context,
  initial,
  onSaved,
}: {
  context: OrganizationContext
  initial: AiProvider | null
  onSaved: (provider: AiProvider) => void | Promise<void>
}) {
  const [form, setForm] = useState<Omit<AiProvider, 'id' | 'version' | 'hasKey'>>(
      initial ?? {
        name: '',
        provider: 'QWEN',
        baseUrl: providerPresets[1]!.url,
        model: '',
        protocol: 'CHAT_COMPLETIONS',
      },
    ),
    [apiKey, setApiKey] = useState(''),
    [clearKey, setClearKey] = useState(false),
    [saving, setSaving] = useState(false),
    [testing, setTesting] = useState(false),
    [notice, setNotice] = useState('')
  const busy = saving || testing
  const payload = () => ({
    name: form.name.trim() || '未命名连接',
    provider: form.provider,
    baseUrl: form.baseUrl,
    model: form.model,
    protocol: form.protocol,
    id: initial?.id,
    expectedVersion: initial?.version,
    apiKey,
    clearKey,
  })
  async function save() {
    if (!form.name.trim()) {
      setNotice('请给连接命名')
      return
    }
    setSaving(true)
    setNotice('')
    try {
      const saved = await requestAdmin<AiProvider>(
        requireAdminApi(),
        context,
        '/admin/ai-review/providers',
        { method: 'POST', body: payload() },
      )
      setForm(saved)
      setApiKey('')
      setClearKey(false)
      setNotice('连接已保存')
      await onSaved(saved)
    } catch (error) {
      setNotice(message(error))
    } finally {
      setSaving(false)
    }
  }
  async function test() {
    setTesting(true)
    setNotice('正在连续测试3次连接…')
    try {
      const result = await requestAdmin<{
        successCount: number
        total: number
        latencyMs: number | null
        summary: string
        attempts: Array<{ ok: boolean; message: string }>
      }>(requireAdminApi(), context, '/admin/ai-review/providers/test', {
        method: 'POST',
        body: payload(),
        timeoutMs: 45000,
      })
      setNotice(
        `${result.summary}（${result.successCount}/${result.total}）${result.latencyMs !== null ? `，平均 ${result.latencyMs} ms` : ''}${result.attempts.find((a) => !a.ok) ? '。' + result.attempts.find((a) => !a.ok)!.message : ''}`,
      )
    } catch (error) {
      setNotice(message(error))
    } finally {
      setTesting(false)
    }
  }
  return (
    <form
      className="gov-detail-body"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <fieldset className="mc-form-grid" disabled={busy}>
        <label className="mc-field">
          <span>连接名称</span>
          <input
            required
            maxLength={80}
            value={form.name}
            placeholder="例如：社区审核"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>服务商</span>
          <select
            value={form.provider}
            onChange={(e) => {
              const preset = providerPresets.find((p) => p.id === e.target.value)!
              setForm({ ...form, provider: preset.id, baseUrl: preset.url, model: '' })
              setApiKey('')
              setClearKey(false)
            }}
          >
            {providerPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mc-field">
          <span>模型</span>
          <input
            required={form.protocol === 'CHAT_COMPLETIONS'}
            maxLength={120}
            value={form.model}
            placeholder="填写该密钥可调用的模型名称"
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </label>
        <label className="mc-field">
          <span>接口类型</span>
          <select
            value={form.protocol}
            onChange={(e) =>
              setForm({ ...form, protocol: e.target.value as AiProvider['protocol'] })
            }
          >
            <option value="CHAT_COMPLETIONS">OpenAI兼容接口</option>
            <option value="REVIEW_GATEWAY">自定义审核网关</option>
          </select>
        </label>
        <label className="mc-field ai-full-width">
          <span>接口地址</span>
          <input
            required
            type="url"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
          />
        </label>
        <label className="mc-field ai-full-width">
          <span>API密钥</span>
          <input
            type="password"
            autoComplete="new-password"
            placeholder={initial?.hasKey ? '已保存，留空保留' : '粘贴API密钥'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        {initial?.hasKey && (
          <label>
            <input
              type="checkbox"
              checked={clearKey}
              onChange={(e) => setClearKey(e.target.checked)}
            />
            移除已保存密钥
          </label>
        )}
      </fieldset>
      <div className="mc-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void test()}
        >
          {testing ? '连接测试中…' : '测试连接'}
        </button>
        <button disabled={busy}>{saving ? '保存中…' : '保存连接'}</button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </form>
  )
}
function RulesForm({
  context,
  initial,
  onDone,
}: {
  context: OrganizationContext
  initial: AiConfig
  onDone: () => void
}) {
  const [form, setForm] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  function update(key: string, patch: Partial<ReviewPolicy>) {
    setForm({
      ...form,
      policies: { ...form.policies, [key]: { ...form.policies[key]!, ...patch } },
    })
  }
  return (
    <form
      className="gov-detail-body"
      onSubmit={(e) => {
        e.preventDefault()
        setBusy(true)
        void requestAdmin(requireAdminApi(), context, '/admin/ai-review/rules', {
          method: 'PATCH',
          body: {
            enabled: form.enabled,
            expectedVersion: initial.version,
            policies: form.policies,
          },
        })
          .then(onDone, (error) => setError(message(error)))
          .finally(() => setBusy(false))
      }}
    >
      <label>
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
        />
        启用自动AI审核
      </label>
      <table className="mc-table">
        <thead>
          <tr>
            <th>内容</th>
            <th>AI审核</th>
            <th>公开顺序</th>
            <th>人工复核</th>
            <th>抽查率</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(form.policies).map(([key, p]) => (
            <tr key={key}>
              <td>{purposeNames[key] ?? key}</td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`${purposeNames[key]}AI审核`}
                  checked={p.enabled}
                  onChange={(e) => update(key, { enabled: e.target.checked })}
                />
              </td>
              <td>
                <select
                  aria-label={`${purposeNames[key]}公开顺序`}
                  value={p.publication}
                  onChange={(e) =>
                    update(key, { publication: e.target.value as ReviewPolicy['publication'] })
                  }
                >
                  <option value="AI_FIRST">先AI，后公开</option>
                  <option value="PUBLIC_FIRST">先公开，后AI</option>
                </select>
              </td>
              <td>
                <select
                  aria-label={`${purposeNames[key]}人工复核`}
                  value={p.human}
                  onChange={(e) => update(key, { human: e.target.value as ReviewPolicy['human'] })}
                >
                  <option value="ALL">全量人工复核</option>
                  <option value="FLAGGED">仅异常内容</option>
                  <option value="SAMPLE">按比例抽查</option>
                </select>
              </td>
              <td>
                <input
                  className="ai-sample-input"
                  type="number"
                  min={0}
                  max={100}
                  disabled={p.human !== 'SAMPLE'}
                  value={p.sampleRate}
                  aria-label={`${purposeNames[key]}抽查率`}
                  onChange={(e) => update(key, { sampleRate: Number(e.target.value) })}
                />
                %
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>动图与视频只自动检查封面，仍需人工复核；私聊不发送至AI。</p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy}>{busy ? '保存中…' : '保存审核规则'}</button>
    </form>
  )
}
