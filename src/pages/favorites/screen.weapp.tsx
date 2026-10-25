import { ScrollView, Text, View } from '@tarojs/components'
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
      const data = await productRequest<{ items: PostSummary[] }>('/me/favorite-posts')
      if (ticket === sequence.current && owner === readSession()?.user.id) {
        setPosts(data.items)
        setError('')
      }
    } catch (issue) {
      if (ticket === sequence.current)
        setError(issue instanceof Error ? issue.message : '收藏读取失败，请重试')
    } finally {
      if (ticket === sequence.current) setLoading(false)
    }
  }, [])
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
      <ScrollView className="native-social-scroll" scrollY showScrollbar={false}>
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
          {!loading && !error && !posts.length && (
            <Text className="native-mail-empty">还没有收藏，点击动态右下角的三个点即可收藏。</Text>
          )}
        </View>
      </ScrollView>
    </NativeSocialPage>
  )
}
