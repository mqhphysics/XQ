import { useEffect, useRef, useState } from 'react'
import { createClientActionId } from '../../features/product/product.repository'
import {
  selfPlayerProfile,
  type SelfPlayerProfile,
} from '../../features/product/self-player-profile.h5'
import { MediaUploadButton } from '../../features/managed-media/index.h5'
import { ProfileDialog } from '../../pages/me/profile-dialog.h5'
import './self-editor.h5.scss'

const positions = [
  ['GOALKEEPER', '门将'],
  ['DEFENDER', '后卫'],
  ['MIDFIELDER', '中场'],
  ['FORWARD', '前锋'],
]
const fields = [
  { key: 'displayName', label: '球员姓名', max: 120 },
  { key: 'jerseyName', label: '球衣显示名', max: 120 },
  { key: 'heightCm', label: '身高（厘米）', number: true, min: 50, max: 250 },
  { key: 'academicYear', label: '年级', max: 32 },
  { key: 'major', label: '专业', max: 120 },
  { key: 'hometown', label: '家乡', max: 120 },
] as const
const ratings = [
  ['ratingShooting', '射门'],
  ['ratingSpeed', '速度'],
  ['ratingDribbling', '盘带'],
  ['ratingPassing', '传球'],
  ['ratingDefending', '防守'],
] as const
export function SelfPlayerEditor({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [original, setOriginal] = useState<SelfPlayerProfile | null>(null)
  const [data, setData] = useState<SelfPlayerProfile | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef<{ fingerprint: string; key: string } | null>(null)
  const lock = useRef(false)
  useEffect(() => {
    let active = true
    void selfPlayerProfile
      .read()
      .then((result) => {
        if (active) {
          setData(result)
          setOriginal(result)
        }
      })
      .catch((issue) => {
        if (active) setError(issue.message)
      })
    return () => {
      active = false
    }
  }, [])
  const change = (key: keyof SelfPlayerProfile, value: string, number = false) =>
    setData((current) =>
      current
        ? { ...current, [key]: value === '' ? null : number ? Number(value) : value }
        : current,
    )
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!data || !original || lock.current) return
    const patch = Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) =>
          !['id', 'updatedAt'].includes(key) && value !== original[key as keyof SelfPlayerProfile],
      ),
    )
    if (!Object.keys(patch).length) {
      setError('请先修改资料')
      return
    }
    const fingerprint = JSON.stringify([original.updatedAt, patch])
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: createClientActionId('self-profile') }
    lock.current = true
    setSaving(true)
    setError('')
    try {
      await selfPlayerProfile.save(original.id, original.updatedAt, patch, pending.current.key)
      onSaved()
      onClose()
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : '保存失败，请重试')
    } finally {
      lock.current = false
      setSaving(false)
    }
  }
  return (
    <ProfileDialog
      wide
      title="编辑球员资料"
      note="编辑你的个人档案。比赛统计由已确认比赛记录生成。"
      onClose={() => {
        if (!lock.current) onClose()
      }}
    >
      {!data && !error && <p role="status">正在读取本人档案…</p>}
      {error && (
        <p role="alert" className="profile-error">
          {error}
        </p>
      )}
      {data && (
        <form className="self-player-form" onSubmit={(event) => void save(event)}>
          <div className="self-player-fields">
            {fields.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  data-self-profile-input
                  type={'number' in field ? 'number' : 'text'}
                  value={data[field.key] ?? ''}
                  disabled={saving}
                  required={field.key === 'displayName'}
                  min={'min' in field ? field.min : undefined}
                  max={'number' in field ? field.max : undefined}
                  maxLength={'number' in field ? undefined : field.max}
                  onChange={(event) => change(field.key, event.target.value, 'number' in field)}
                />
              </label>
            ))}
            {[
              ['position', '主要位置'],
              ['secondaryPosition', '第二位置'],
              ['dominantFoot', '惯用脚'],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  data-self-profile-input
                  value={String(data[key as keyof SelfPlayerProfile] ?? '')}
                  disabled={saving}
                  onChange={(event) => change(key as keyof SelfPlayerProfile, event.target.value)}
                >
                  <option value="">未填写</option>
                  {(key === 'dominantFoot'
                    ? [
                        ['LEFT', '左脚'],
                        ['RIGHT', '右脚'],
                        ['BOTH', '双脚'],
                      ]
                    : positions
                  ).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              个人配色
              <input
                data-self-profile-input
                type="color"
                value={data.profileColor ?? '#315b3d'}
                disabled={saving}
                onChange={(event) => change('profileColor', event.target.value)}
              />
            </label>
          </div>
          <label className="self-player-bio">
            球员简介
            <textarea
              data-self-profile-input
              rows={4}
              maxLength={600}
              value={data.bio ?? ''}
              disabled={saving}
              onChange={(event) => change('bio', event.target.value)}
            />
          </label>
          <h3>个人技术自评</h3>
          <div className="self-player-ratings">
            {ratings.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  data-self-profile-input
                  type="number"
                  min={0}
                  max={100}
                  value={data[key] ?? ''}
                  disabled={saving}
                  onChange={(event) => change(key, event.target.value, true)}
                />
              </label>
            ))}
          </div>
          <div className="self-player-photo">
            <span>球员照片</span>
            <MediaUploadButton purpose="PLAYER_PORTRAIT" targetId={data.id} label="更换球员照片" />
          </div>
          <div className="profile-dialog__actions">
            <button
              data-profile-button
              type="button"
              className="profile-button profile-button--outline"
              disabled={saving}
              onClick={onClose}
            >
              取消
            </button>
            <button
              data-profile-button
              type="submit"
              className="profile-button profile-button--primary"
              disabled={saving}
            >
              {saving ? '保存中…' : '保存球员资料'}
            </button>
          </div>
        </form>
      )}
    </ProfileDialog>
  )
}
