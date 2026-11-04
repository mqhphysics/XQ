import { useEffect, useState } from 'react'
import { campusRepository, type CampusProfile } from '../../features/campus/campus.repository.h5'
import { productRepository } from '../../features/product/product.repository'

export function StudentIdentitySummary() {
  const [data, setData] = useState<CampusProfile | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let current = true
    campusRepository
      .me()
      .then((value) => {
        if (current) setData(value)
      })
      .catch((issue) => {
        if (current) setError(issue instanceof Error ? issue.message : '学生档案读取失败')
      })
    return () => {
      current = false
    }
  }, [])
  async function confirm() {
    if (!data?.playerCandidate || busy) return
    setBusy(true)
    setError('')
    try {
      await campusRepository.onboarding('CONFIRM_PLAYER', data.playerCandidate.id)
      setData(await campusRepository.me())
      const user = await productRepository.getMe()
      window.dispatchEvent(new CustomEvent('xiaoqiu:identity:changed', { detail: user }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '身份确认失败')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="campus-student-identity">
      <div>
        <span className="campus-eyebrow">学生基础档案</span>
        {data?.studentRecord ? (
          <>
            <h3>{data.studentRecord.realName}</h3>
            <p>
              {data.studentRecord.studentNumber ?? '学号待补充'} · {data.studentRecord.collegeName}
            </p>
            <small>
              {data.identityNeedsReview
                ? '学生身份待核验'
                : data.studentVerifiedAt
                  ? '学生身份已核验'
                  : '基础档案待完善'}
              {data.studentRecord.isDemo ? ' · 演示资料' : ''}
            </small>
          </>
        ) : (
          <p>学生档案尚未关联，请向管理员提供核验信息。</p>
        )}
      </div>
      {data?.playerCandidate && data.onboardingCompletedAt && (
        <button data-campus-button type="button" disabled={busy} onClick={() => void confirm()}>
          {busy ? '正在确认…' : `确认${data.playerCandidate.name}的球员身份`}
        </button>
      )}
      {error && (
        <p className="campus-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
