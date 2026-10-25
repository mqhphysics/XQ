import { Image, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import type { TeamSummary } from '../../features/product/product.types'
import { getTeamNavOrnamentColor } from './team-nav-palette.h5'
import { useNativePreferences } from '../native-ui/preferences.weapp'
import {
  leafAnimationBase64,
  leafAnimationDuration,
  leafStillBase64,
} from './team-leaf-frames.weapp'
import { tintLeafGif } from './team-leaf-tint.weapp'
import './team-tab-focus.weapp.scss'

let sequence = 0
const playbackRate = 1.25
export function NativeTeamTabFocus({ team }: { team?: TeamSummary | null }) {
  const [overlay, setOverlay] = useState(false)
  const [files, setFiles] = useState<{ animation: string; still: string } | null>(null)
  const [held, setHeld] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { reduceMotion } = useNativePreferences()
  const color = getTeamNavOrnamentColor(team)
  useEffect(() => {
    const listener = (open: boolean) => setOverlay(open)
    Taro.eventCenter.on('xiaoqiu:native-overlay', listener)
    Taro.eventCenter.on('xiaoqiu:native-detail-visible', listener)
    return () => {
      Taro.eventCenter.off('xiaoqiu:native-overlay', listener)
      Taro.eventCenter.off('xiaoqiu:native-detail-visible', listener)
    }
  }, [])
  useEffect(() => {
    if (overlay) {
      setFiles(null)
      return
    }
    const fs = Taro.getFileSystemManager()
    const base = `${Taro.env.USER_DATA_PATH}/xiaoqiu-team-leaf-${Date.now()}-${++sequence}`
    const paths = { animation: `${base}.gif`, still: `${base}-still.gif` }
    const write = (path: string, template: string) =>
      fs.writeFileSync(
        path,
        tintLeafGif(new Uint8Array(Taro.base64ToArrayBuffer(template)), color, playbackRate)
          .buffer as ArrayBuffer,
      )
    try {
      write(paths.animation, leafAnimationBase64)
      write(paths.still, leafStillBase64)
      setHeld(reduceMotion)
      setFiles(paths)
    } catch (issue) {
      console.warn('Team ornament image unavailable', issue)
      setFiles(null)
    }
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      for (const path of [paths.animation, paths.still]) {
        try {
          fs.unlinkSync(path)
        } catch {
          /* A closed image may already have released its temporary file. */
        }
      }
    }
  }, [color, overlay, reduceMotion])
  if (overlay || !files) return null
  return (
    <View
      className="native-team-focus"
      aria-hidden="true"
      data-growth-phase={held ? 'complete' : 'growing'}
    >
      <Image
        key={files.animation}
        className="native-team-focus__image"
        mode="scaleToFill"
        src={held ? files.still : files.animation}
        onLoad={() => {
          if (!held && !timer.current)
            timer.current = setTimeout(() => setHeld(true), leafAnimationDuration / playbackRate)
        }}
      />
    </View>
  )
}
