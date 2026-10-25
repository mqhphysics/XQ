import { Button, Text, View } from '@tarojs/components'
import { getCurrentInstance } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNativeRefreshTask } from '../../features/product/native-refresh.weapp'
import { PublicShell } from '../../components/public-shell'
import { DataState } from '../../components/public-ui'
import { PostCard, UserAvatar } from '../../components/product-ui'
import { VerificationBadge } from '../../components/verification-badge'
import { NativeContentPager } from '../../components/native-navigation/content-pager.weapp'
import {
  NativeDetailTabs,
  NativeFacts,
  NativeProfileCover,
} from '../../components/native-navigation/profile-parts.weapp'
import { useNativeRouteState } from '../../features/native-navigation/index.weapp'
import { productRepository, peekNativeProduct } from '../../features/product/product.repository'
import { useNativeCurrentUser } from '../../features/product/current-user.weapp'
import type { PublicPersonResponse } from '../../features/product/product.types'
import { identityBadgeKinds, identityLabels } from '../../features/product/identity-badges'
import { openPlayer } from '../../features/product/player-navigation'
import { openPost } from '../../features/product/post-navigation'
import { EditProfile } from '../me/desktop-profile.weapp'
import './index.weapp.scss'
import { openMessaging } from '../../components/messaging-drawer/index.weapp'
import { nativeWriteEnabled } from '../../features/native-social/config.weapp'

export default function NativePersonScreen({
  userId: suppliedUser,
  tournamentId: suppliedTournament,
}: { userId?: string | undefined; tournamentId?: string | undefined } = {}) {
  const params = getCurrentInstance().router?.params
  const userId = suppliedUser || params?.userId || '',
    tournamentId = suppliedTournament || params?.tournamentId || ''
  const [person, setPerson] = useNativeRouteState<PublicPersonResponse | null>(
    'person-data',
    peekNativeProduct<PublicPersonResponse>(
      `/public/people/${encodeURIComponent(userId)}${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`,
    ) || null,
  )
  const [tab, setTab] = useNativeRouteState('person-tab', 0)
  const [attempt, setAttempt] = useState(0),
    [error, setError] = useState(''),
    [editing, setEditing] = useState(false)
  const viewer = useNativeCurrentUser()
  const loadSequence = useRef(0)
  const load = useCallback(async () => {
    const ticket = ++loadSequence.current
    try {
      const value = await productRepository.getPerson(userId, tournamentId)
      if (ticket === loadSequence.current) {
        setPerson(value)
        setError('')
      }
    } catch (issue) {
      if (ticket === loadSequence.current)
        setError(issue instanceof Error ? issue.message : '档案读取失败')
    }
  }, [userId, tournamentId, attempt, setPerson])
  useNativeRefreshTask(load)
  useEffect(() => {
    void load()
    return () => {
      loadSequence.current++
    }
  }, [load])
  return (
    <PublicShell active="home" showBack tournamentId={tournamentId}>
      {error && (
        <DataState
          kind="error"
          title="个人档案暂不可用"
          description={error}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      )}
      {!person && !error && <DataState kind="loading" title="正在读取个人档案" />}
      {person && (
        <View className="native-person-detail">
          <NativeProfileCover personal src={person.coverUrl}>
            <UserAvatar name={person.displayName} avatarUrl={person.avatarUrl} size="large" />
            <View className="native-profile-cover__copy">
              <View className="native-person-detail__name">
                <Text>{person.displayName}</Text>
                <VerificationBadge
                  level={person.verificationLevel}
                  roles={person.roles}
                  official={person.official}
                  displayedKind={person.displayedBadgeKind}
                />
              </View>
              <Text>{person.organizationName || '校园社区'}</Text>
              <Text className="native-person-detail__bio">
                {person.bio || '还没有填写个人简介'}
              </Text>
            </View>
            {nativeWriteEnabled('privateMessages') &&
              person.messageable &&
              viewer?.id !== person.id && (
                <Button
                  className="native-person-message"
                  onClick={() => void openMessaging(person)}
                >
                  发私信
                </Button>
              )}
          </NativeProfileCover>
          {viewer?.id === person.id && (
            <Button className="native-button native-person-edit" onClick={() => setEditing(true)}>
              编辑个人信息
            </Button>
          )}
          {person.player && person.showPlayerIdentity !== false && (
            <Button
              className="native-person-player-link"
              onClick={() =>
                void openPlayer(person.player!.id, person.tournamentId || tournamentId)
              }
            >
              <Text>球员身份</Text>
              <Text>{person.player.displayName}</Text>
              <Text>查看球员档案 ›</Text>
            </Button>
          )}
          <NativeDetailTabs tabs={['动态', '资料']} selected={tab} onSelect={setTab} />
          <NativeContentPager
            index={tab}
            onSelect={setTab}
            pages={[
              <>
                {person.posts.length ? (
                  person.posts.map((post) => (
                    <PostCard key={post.id} post={post} onOpen={() => void openPost(post.id)} />
                  ))
                ) : (
                  <Text className="native-profile-copy">暂无公开动态</Text>
                )}
              </>,
              <>
                <NativeFacts
                  values={[
                    ['昵称', person.displayName],
                    ['学校', person.organizationName || '未填写'],
                    [
                      '身份',
                      identityBadgeKinds(person.verificationLevel, person.roles, person.official)
                        .map((kind) => identityLabels[kind])
                        .join('、') || '普通用户',
                    ],
                  ]}
                />
                <Text className="native-profile-section-title">个人简介</Text>
                <Text className="native-profile-copy">{person.bio || '还没有填写个人简介'}</Text>
              </>,
            ]}
          />
          {editing && viewer?.id === person.id && (
            <EditProfile
              user={viewer}
              onClose={() => setEditing(false)}
              onChanged={() => {
                setEditing(false)
                setAttempt((n) => n + 1)
              }}
            />
          )}
        </View>
      )}
    </PublicShell>
  )
}
