import { Button, Image, Text } from '@tarojs/components'
import { useContext, useEffect, useRef, useState } from 'react'
import { NativeDetailActiveContext } from '../native-navigation/detail-context.weapp'
import { useNativePreferences } from '../../components/native-ui/preferences.weapp'
import { resolveMediaUrl } from '../product/product.repository'
import { matchGifUrl } from './match-gif.weapp'
import { measureNativeContent } from '../../components/native-navigation/content-pager.weapp'
import type { MediaAsset } from './repository.h5'

export function NativeGoalClip({
  asset,
  active,
  onPlay,
}: {
  asset: MediaAsset
  active: boolean
  onPlay: (source?: string) => void
}) {
  const detailActive = useContext(NativeDetailActiveContext)
  const { autoplayGif } = useNativePreferences()
  const gif = asset.mimeType !== 'video/mp4'
  const publicGif = gif && asset.status !== 'PENDING'
  const playing = publicGif && active && detailActive && autoplayGif
  const [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    retries = useRef(0)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const base = publicGif ? matchGifUrl(asset) : ''
  const source = attempt ? `${base}&retry=${attempt}` : base
  const retry = () => {
    setFailed(false)
    setLoaded(false)
    setAttempt((value) => value + 1)
  }
  return (
    <Button
      className="native-event-media"
      aria-label="播放比赛片段"
      onClick={() => {
        if (failed) {
          retries.current = 0
          retry()
        } else onPlay(publicGif ? source : undefined)
      }}
    >
      {/* Warm the native image cache on match entry; release inactive animation views after loading. */}
      {publicGif && detailActive && (active || !loaded) && !failed && (
        <Image
          key={`${playing ? 'playing' : 'preload'}:${source}`}
          className={playing ? '' : 'native-event-media__preload'}
          src={source}
          mode="widthFix"
          lazyLoad={false}
          onLoad={() => {
            if (timer.current) clearTimeout(timer.current)
            timer.current = undefined
            retries.current = 0
            setLoaded(true)
            setFailed(false)
            measureNativeContent()
          }}
          onError={() => {
            if (timer.current) return
            if (retries.current++ < 2)
              timer.current = setTimeout(() => {
                timer.current = undefined
                retry()
              }, 500)
            else setFailed(true)
          }}
        />
      )}
      {(!playing || !loaded || failed) && (
        <Image
          src={resolveMediaUrl(asset.posterUrl || asset.contentUrl)!}
          mode="widthFix"
          lazyLoad={false}
          onLoad={measureNativeContent}
        />
      )}
      <Text>
        {failed ? '点击重试' : !gif ? '▶ 视频' : playing ? (loaded ? 'GIF' : '加载中') : '▶ GIF'}
      </Text>
    </Button>
  )
}
