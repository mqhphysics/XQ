import { Button, Image, Text } from '@tarojs/components'
import { useContext, useEffect, useRef, useState } from 'react'
import { NativeDetailActiveContext } from '../native-navigation/detail-context.weapp'
import { useNativePreferences } from '../../components/native-ui/preferences.weapp'
import { resolveMediaUrl } from '../product/product.repository'
import { prepareMatchGif } from './gif-cache.weapp'
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
  const detailActive = useContext(NativeDetailActiveContext),
    { autoplayGif } = useNativePreferences()
  const publicGif = asset.mimeType !== 'video/mp4' && asset.status !== 'PENDING'
  const [source, setSource] = useState(''),
    [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0)
  const alive = useRef(true),
    opening = useRef(false)
  useEffect(
    () => () => {
      alive.current = false
    },
    [],
  )
  useEffect(() => {
    if (!publicGif || !detailActive) return
    let current = true
    setFailed(false)
    void prepareMatchGif(asset)
      .then((path) => {
        if (current) {
          setFailed(false)
          setSource(path)
        }
      })
      .catch(() => {
        if (current) setFailed(true)
      })
    return () => {
      current = false
    }
  }, [asset.id, asset.version, asset.bytes, publicGif, detailActive, attempt])
  const playing = publicGif && active && detailActive && autoplayGif && !!source && !failed
  const open = async () => {
    if (opening.current) return
    if (failed) {
      setSource('')
      setLoaded(false)
      setFailed(false)
      setAttempt((v) => v + 1)
      return
    }
    if (!publicGif) {
      onPlay()
      return
    }
    opening.current = true
    try {
      const path = await prepareMatchGif(asset)
      if (alive.current) {
        setSource(path)
        onPlay(path)
      }
    } catch {
      if (alive.current) setFailed(true)
    } finally {
      opening.current = false
    }
  }
  return (
    <Button className="native-event-media" aria-label="播放比赛片段" onClick={() => void open()}>
      {playing && (
        <Image
          key={source}
          src={source}
          mode="widthFix"
          lazyLoad={false}
          onLoad={() => {
            setLoaded(true)
            measureNativeContent()
          }}
          onError={() => setFailed(true)}
        />
      )}
      {(!playing || !loaded) && (
        <Image
          src={resolveMediaUrl(asset.posterUrl || asset.contentUrl)!}
          mode="widthFix"
          lazyLoad={false}
          onLoad={measureNativeContent}
        />
      )}
      <Text>
        {failed
          ? '点击重试'
          : asset.mimeType === 'video/mp4'
            ? '▶ 视频'
            : publicGif && !source
              ? '加载中'
              : playing
                ? 'GIF'
                : '▶ GIF'}
      </Text>
    </Button>
  )
}
