import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayFocus } from '../overlay-focus'
import { SettingsDialog as LegacySettingsDialog } from './legacy-dialog'
import {
  defaultPreferences,
  savePreferences,
  type BrowserPreferences,
  usePreferenceValues,
} from './preferences.h5'
import './desktop.h5.scss'
import { MessageSettings } from './message-settings.h5'
import { PlayerIdentityPreference } from '../../features/campus/player-identity-preference.h5'

export function SettingsDialog({
  onClose,
  section,
}: {
  onClose: () => void
  section?: 'messages' | undefined
}) {
  const [desktop] = useState(() => window.matchMedia('(min-width: 721px)').matches)
  return desktop ? (
    <DesktopSettings onClose={onClose} section={section} />
  ) : (
    <LegacySettingsDialog onClose={onClose} />
  )
}

function DesktopSettings({
  onClose,
  section,
}: {
  onClose: () => void
  section?: 'messages' | undefined
}) {
  useOverlayFocus(true, '.desktop-settings', onClose)
  const preferences = usePreferenceValues()
  const [message, setMessage] = useState('')
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  const update = (next: BrowserPreferences) => {
    try {
      savePreferences(next)
      setMessage('已保存到当前浏览器')
    } catch {
      setMessage('保存失败，请检查浏览器存储权限')
    }
  }
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
      setFullscreen(Boolean(document.fullscreenElement))
    } catch {
      setMessage('当前浏览器无法切换全屏')
    }
  }
  const options: Array<{ key: keyof BrowserPreferences; title: string; description: string }> = [
    { key: 'reduceMotion', title: '减少动画', description: '减少页面动效，让阅读和切换更平静' },
    { key: 'largeText', title: '增大动态文字', description: '放大动态正文，更轻松地阅读球场故事' },
    {
      key: 'hideDecoration',
      title: '简洁背景',
      description: '隐藏球场线稿装饰，保留个人背景和球队照片',
    },
  ]
  return createPortal(
    <div
      className="desktop-settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="desktop-settings xq-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-settings-title"
        tabIndex={-1}
      >
        <header className="desktop-settings__header xq-dialog__header">
          <div>
            <h2 id="desktop-settings-title">{section === 'messages' ? '消息设置' : '设置'}</h2>
            <p>让晓球更适合你的浏览习惯。</p>
          </div>
          <button data-settings-control aria-label="关闭设置" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="desktop-settings__body xq-dialog__body">
          {section === 'messages' ? (
            <MessageSettings />
          ) : (
            <>
              <h3>浏览体验</h3>
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
                      onClick={() =>
                        update({ ...preferences, [option.key]: !preferences[option.key] })
                      }
                    >
                      <span />
                    </button>
                  </div>
                ))}
                <div className="desktop-settings__row">
                  <div>
                    <strong>全屏浏览</strong>
                    <p>让比赛内容铺满整个屏幕</p>
                  </div>
                  <button
                    data-settings-control
                    className="desktop-settings__action"
                    disabled={!document.fullscreenEnabled}
                    onClick={() => void toggleFullscreen()}
                  >
                    {fullscreen ? '退出全屏' : '进入全屏'}
                  </button>
                </div>
              </div>
              <MessageSettings />
              <h3>用户主页</h3>
              <PlayerIdentityPreference />
              <h3>本机偏好</h3>
              <div className="desktop-settings__row desktop-settings__reset">
                <div>
                  <strong>恢复默认设置</strong>
                  <p>恢复上面的浏览选项，保留你的关注和收藏。</p>
                </div>
                <button
                  data-settings-control
                  className="desktop-settings__action"
                  onClick={() => update({ ...defaultPreferences })}
                >
                  恢复默认
                </button>
              </div>
              <p className="desktop-settings__notice">这些设置即时生效，仅保存在当前浏览器。</p>
              <p className="desktop-settings__status" role="status">
                {message}
              </p>
            </>
          )}
        </div>
        <footer className="desktop-settings__footer xq-dialog__footer">
          <span>晓球 V1.0.0</span>
          <span>把校园比赛认真记录下来</span>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
