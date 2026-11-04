import { useState } from 'react'
import {
  readPreferences,
  savePreferences,
  usePreferenceValues,
  type BrowserPreferences,
} from './preferences.h5'

export function MessageSettings() {
  const preferences = usePreferenceValues()
  const [error, setError] = useState('')
  const options: Array<{ key: keyof BrowserPreferences; title: string; description: string }> = [
    {
      key: 'showReplyMessages',
      title: '显示回复我的',
      description: '在消息中心显示评论与回复提醒',
    },
    {
      key: 'showMentionMessages',
      title: '显示 @ 我的',
      description: '在消息中心显示提及你的消息分类',
    },
    { key: 'showLikeMessages', title: '显示收到的赞', description: '在消息中心显示点赞提醒' },
    {
      key: 'enterSends',
      title: 'Enter 发送消息',
      description: '关闭后使用发送按钮，Enter 用于换行',
    },
  ]
  const update = (key: keyof BrowserPreferences) => {
    try {
      const current = readPreferences()
      savePreferences({ ...current, [key]: !current[key] })
      setError('')
    } catch {
      setError('保存失败，请检查浏览器存储权限')
    }
  }
  return (
    <>
      <h3 id="message-settings-section">消息设置</h3>
      <div className="desktop-settings__group">
        {options.map((option) => (
          <div className="desktop-settings__row" key={option.key}>
            <div>
              <strong>{option.title}</strong>
              <p>{option.description}</p>
            </div>
            <button
              data-settings-control
              className="desktop-settings__switch"
              role="switch"
              aria-label={option.title}
              aria-checked={preferences[option.key]}
              onClick={() => update(option.key)}
            >
              <span />
            </button>
          </div>
        ))}
      </div>
      <p className="desktop-settings__notice">
        仅调整当前浏览器的显示与输入习惯。申请、反馈和审核结果等系统消息始终保留。
      </p>
      {error && (
        <p role="alert" className="profile-error">
          {error}
        </p>
      )}
    </>
  )
}
