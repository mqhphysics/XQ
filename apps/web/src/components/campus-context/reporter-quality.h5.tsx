import { useEffect, useState } from 'react'
import { campusRepository, type ReporterQuality } from '../../features/campus/campus.repository.h5'

const statusLabel: Record<string, string> = {
  ACTIVE: '正常记录',
  PROBATION: '复训考察中',
  FROZEN: '已冻结',
  COOLDOWN: '等待解冻',
  BANNED: '资格已封禁',
}
export function ReporterQualityPanel() {
  const [data, setData] = useState<ReporterQuality | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(''),
    [rules, setRules] = useState(false),
    [selected, setSelected] = useState<ReporterQuality['cases'][number] | null>(null)
  async function load() {
    try {
      setData(await campusRepository.quality())
      setError('')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '质量分读取失败')
    }
  }
  useEffect(() => {
    void load()
  }, [])
  async function submit() {
    if (busy || reason.trim().length < 8) return
    setBusy(true)
    try {
      if (selected) await campusRepository.appeal(selected.id, reason.trim(), selected.version)
      else await campusRepository.reinstate(reason.trim())
      setSelected(null)
      setReason('')
      await load()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '提交失败')
    } finally {
      setBusy(false)
    }
  }
  if (!data?.profile)
    return error ? (
      <p className="campus-error" role="alert">
        {error}
        <button data-campus-button type="button" onClick={() => void load()}>
          重试
        </button>
      </p>
    ) : null
  const profile = data.profile
  return (
    <section className="reporter-quality" aria-label="信息员记录质量分">
      <div className="reporter-quality__heading">
        <div>
          <span className="campus-eyebrow">信息员身份</span>
          <h3>记录质量分</h3>
        </div>
        <button
          data-campus-button
          type="button"
          className="reporter-quality__explain"
          onClick={() => setRules(!rules)}
          aria-expanded={rules}
        >
          评分说明
        </button>
      </div>
      <div className={`reporter-quality__summary ${profile.score < 60 ? 'needs-review' : ''}`}>
        <div className="reporter-quality__score">
          <strong>{profile.score}</strong>
          <span>/ 100</span>
        </div>
        <div>
          <b>{statusLabel[profile.status] ?? profile.status}</b>
          <p>本轮合格记录 {profile.consecutiveQualified} / 3 场</p>
          {profile.cooldownUntil && (
            <p>复核已通过，{new Date(profile.cooldownUntil).toLocaleDateString('zh-CN')}后恢复</p>
          )}
          {profile.probationUntil && profile.status === 'PROBATION' && (
            <p>
              最早于 {new Date(profile.probationUntil).toLocaleDateString('zh-CN')}
              完成考察，还需经过一个完整正式赛季
            </p>
          )}
        </div>
      </div>
      {rules && (
        <div className="reporter-quality__rules">
          <p>
            初始100分；他人提出纠错后，由总管理员核实，确认一次差错扣10分。同一差错重复反馈只处理一次。
          </p>
          <p>
            连续三场比赛的数据通过审核，加10分，最高100分。低于60分或完整赛季没有合格记录，冻结信息员身份。
          </p>
          <p>
            冻结后可以说明情况并申请复训；通过后等待7天。首次恢复至少60分，后续恢复不重复补分。考察期至少90天且覆盖之后一个完整正式赛季，确认差错每次扣20分；通过考察后恢复扣10分。
          </p>
          <p>
            0分封禁信息员资格，不能再次申请；如裁定有误，可以在通知后7天内申诉。普通账号功能不受信息员冻结影响。
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="campus-error">
          {error}
        </p>
      )}
      {profile.status === 'FROZEN' && !data.applications.some((a) => a.status === 'SUBMITTED') && (
        <div className="reporter-quality__application">
          <label data-campus-label>
            申请复训与解冻
            <textarea
              data-campus-input
              value={reason}
              minLength={8}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="说明情况、整改和接下来如何核对记录（至少8字）"
            />
          </label>
          <button
            data-campus-button
            type="button"
            disabled={busy || reason.trim().length < 8}
            onClick={() => void submit()}
          >
            {busy ? '正在提交…' : '提交申请'}
          </button>
        </div>
      )}
      {data.applications.slice(0, 1).map((a) => (
        <p className="reporter-quality__notice" key={a.id}>
          最近申请：
          {a.status === 'SUBMITTED'
            ? '等待总管理员复核'
            : a.status === 'APPROVED'
              ? '复核通过'
              : a.status === 'REJECTED'
                ? '暂未通过'
                : a.status}
          {a.reviewNote ? ` · ${a.reviewNote}` : ''}
        </p>
      ))}
      {data.cases.length > 0 && (
        <div className="reporter-quality__cases">
          <h4>纠错记录</h4>
          {data.cases.map((item) => (
            <article key={item.id}>
              <strong>
                {item.status === 'CONFIRMED'
                  ? '已确认差错'
                  : item.status === 'DISMISSED'
                    ? '不成立'
                    : item.status === 'OVERTURNED'
                      ? '已撤销裁定'
                      : '待核实'}
              </strong>
              <p>{item.description}</p>
              {item.reviewNote && (
                <p className="reporter-quality__note">复核意见：{item.reviewNote}</p>
              )}
              {item.status === 'CONFIRMED' &&
                !item.appeal &&
                item.reviewedAt &&
                Date.now() - new Date(item.reviewedAt).getTime() <= 7 * 86400000 && (
                  <button
                    data-campus-button
                    type="button"
                    onClick={() => {
                      setSelected(item)
                      setReason('')
                    }}
                  >
                    对此申请复核
                  </button>
                )}
              {selected?.id === item.id && (
                <div className="reporter-quality__application">
                  <textarea
                    data-campus-input
                    aria-label="申诉说明"
                    value={reason}
                    maxLength={2000}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="补充说明及证据（至少8字）"
                  />
                  <button
                    data-campus-button
                    type="button"
                    disabled={busy || reason.trim().length < 8}
                    onClick={() => void submit()}
                  >
                    提交申诉
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="reporter-quality__ledger">
        <h4>最近记录</h4>
        {data.entries.slice(0, 8).map((item) => (
          <div key={item.id}>
            <span>
              {item.reason}
              <small>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</small>
            </span>
            <b className={item.delta < 0 ? 'is-negative' : ''}>
              {item.delta > 0 ? '+' : ''}
              {item.delta === 0 ? '—' : item.delta}
            </b>
          </div>
        ))}
      </div>
    </section>
  )
}
