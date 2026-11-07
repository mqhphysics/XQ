import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NativeSocialPage } from '../../components/native-social/page-frame.weapp'
import { PostCard } from '../../components/product-ui'
import { DataState } from '../../components/public-ui'
import { productRequest } from '../../features/product/product.repository'
import type { PostSummary } from '../../features/product/product.types'
import { readSession } from '../../features/product/session'
import { openPost } from '../../features/product/post-navigation'

export default function NativeFavoritesScreen() {
  const [posts, setPosts] = useState<PostSummary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [moreLoading, setMoreLoading] = useState(false),
    [moreError, setMoreError] = useState('')
  const moreLock = useRef(false)
  const sequence = useRef(0)
  const load = useCallback(async () => {
    const ticket = ++sequence.current,
      owner = readSession()?.user.id
    if (!owner) {
      setError('请先登录后查看收藏')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await productRequest<{ items: PostSummary[]; nextCursor: string | null }>(
        '/me/favorite-posts?limit=30',
      )
      if (ticket === sequence.current && owner === readSession()?.user.id) {
        setPosts(data.items)
        setNextCursor(data.nextCursor)
        setMoreError('')
        setError('')
      }
    } catch (issue) {
      if (ticket === sequence.current)
        setError(issue instanceof Error ? issue.message : '收藏读取失败，请重试')
    } finally {
      if (ticket === sequence.current) setLoading(false)
    }
  }, [])
  const more = async () => {
    if (!nextCursor || loading || moreLock.current) return
    const owner = readSession()?.accessToken,
      ticket = sequence.current
    moreLock.current = true
    setMoreLoading(true)
    setMoreError('')
    try {
      const page = await productRequest<{ items: PostSummary[]; nextCursor: string | null }>(
        `/me/favorite-posts?limit=30&before=${encodeURIComponent(nextCursor)}`,
      )
      if (owner !== readSession()?.accessToken || ticket !== sequence.current) return
      setPosts((current) => [
        ...current,
        ...page.items.filter((item) => !current.some((post) => post.id === item.id)),
      ])
      setNextCursor(page.nextCursor)
    } catch (issue) {
      if (owner === readSession()?.accessToken && ticket === sequence.current)
        setMoreError(issue instanceof Error ? issue.message : '下一页读取失败，请重试')
    } finally {
      moreLock.current = false
      setMoreLoading(false)
    }
  }
  useEffect(() => {
    void load()
    const changed = () => {
      void load()
    }
    Taro.eventCenter.on('xiaoqiu:native-favorites-changed', changed)
    return () => {
      sequence.current++
      Taro.eventCenter.off('xiaoqiu:native-favorites-changed', changed)
    }
  }, [load])
  return (
    <NativeSocialPage title="我的收藏">
      <ScrollView
        className="native-social-scroll"
        scrollY
        showScrollbar={false}
        onScrollToLower={() => void more()}
      >
        <View className="native-favorites-list">
          {loading && !posts.length && <DataState kind="loading" title="正在读取收藏" />}
          {error && (
            <DataState
              kind="error"
              title="收藏暂不可用"
              description={error}
              onRetry={() => void load()}
            />
          )}
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onOpen={() => void openPost(post.id)} />
          ))}
          {moreError && <Text className="native-error">{moreError}</Text>}
          {nextCursor && (
            <Button
              className="native-button"
              loading={moreLoading}
              disabled={loading || moreLoading}
              onClick={() => void more()}
            >
              {moreError ? '重试加载' : '加载更多收藏'}
            </Button>
          )}
          {!loading && !error && !posts.length && (
            <Text className="native-favorites-empty">
              还没有收藏，打开动态后点击收藏图标即可保存。
            </Text>
          )}
        </View>
      </ScrollView>
    </NativeSocialPage>
  )
}
