import { Button, Image, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useContext, useEffect, useId, useState } from 'react'
import { NativeDetailActiveContext } from '../native-navigation/detail-context.weapp'
import { useNativePreferences } from '../../components/native-ui/preferences.weapp'
import { resolveMediaUrl } from '../product/product.repository'
import { forgetMatchGif, preloadMatchGif } from './match-gif.weapp'
import type { MediaAsset } from './repository.h5'

export function NativeGoalClip({
  asset,
  active,
  onPlay,
}: {
  asset: MediaAsset
  active: boolean
  onPlay: () => void
}) {
  const id = `goal-clip-${useId().replace(/[^a-z0-9]/gi, '')}`
  const detailActive = useContext(NativeDetailActiveContext)
  const { autoplayGif, reduceMotion } = useNativePreferences()
  const [source, setSource] = useState(''),
    [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)
  const gif = asset.mimeType !== 'video/mp4'
  // All panels mount when a match opens, so downloading starts before this tab is selected.
  useEffect(() => {
    let alive = true
    setSource('')
    setFailed(false)
    if (gif && asset.status !== 'PENDING')
      void preloadMatchGif(asset)
        .then((path) => {
          if (alive) setSource(path)
        })
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [asset.id, asset.contentUrl, asset.version, asset.status, gif])
  useEffect(() => {
    setVisible(false)
    const page = Taro.getCurrentInstance().page
    if (!active || !detailActive || !page) return
    let alive = true
    const observer = Taro.createIntersectionObserver(page, { thresholds: [0, 0.01] })
    Taro.nextTick(() => {
      if (alive)
        observer.relativeToViewport().observe(`#${id}`, (entry) => {
          if (alive) setVisible((entry.intersectionRatio ?? 0) > 0)
        })
    })
    return () => {
      alive = false
      observer.disconnect()
    }
  }, [active, detailActive, id])
  const playing =
    gif && active && detailActive && visible && autoplayGif && !reduceMotion && !!source && !failed
  return (
    <Button id={id} className="native-event-media" aria-label="播放比赛片段" onClick={onPlay}>
      <Image
        src={playing ? source : resolveMediaUrl(asset.posterUrl || asset.contentUrl)!}
        mode="aspectFill"
        lazyLoad={!playing}
        onError={() => {
          if (playing) {
            setFailed(true)
            forgetMatchGif(asset)
          }
        }}
      />
      <Text>{!gif ? '▶ 视频' : playing ? 'GIF' : '▶ GIF'}</Text>
    </Button>
  )
}
