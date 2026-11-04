import { Button, Text, Textarea, View } from '@tarojs/components'
import { useState } from 'react'
import { NativeDialog } from '../../components/native-ui/index.weapp'
import { NativeStats } from '../../components/native-navigation/profile-parts.weapp'
import { openMatch } from '../product/match-navigation'
import { formatDate } from '../product/product.format'
import { refereeApi, officialRoleLabels, type RefereeProfile } from './repository.weapp'
export function NativeRefereePanel({
  profile,
  own,
  onChange,
}: {
  profile: RefereeProfile
  own: boolean
  onChange: (next: RefereeProfile) => void
}) {
  const [editing, setEditing] = useState(false),
    [bio, setBio] = useState(profile.bio),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <View className="native-referee-panel">
      <NativeStats
        values={[
          ['执裁场次', profile.totalMatches],
          ['主裁', profile.refereeMatches],
          ['边裁', profile.assistantMatches],
          ['第四官员', profile.fourthOfficialMatches],
          ['出示黄牌', profile.yellowCards],
          ['出示红牌', profile.redCards],
        ]}
      />
      <Text className="native-note">黄红牌仅统计担任主裁时的正式比赛记录</Text>
      <View className="native-referee-heading">
        <Text className="native-profile-section-title">执裁特点</Text>
        {own && (
          <Button
            className="native-button native-button--quiet"
            onClick={() => {
              setBio(profile.bio)
              setEditing(true)
            }}
          >
            编辑介绍
          </Button>
        )}
      </View>
      <Text className="native-profile-copy">{profile.bio || '暂未填写执裁介绍'}</Text>
      <Text className="native-profile-section-title">执裁记录</Text>
      {profile.matches.map((match) => (
        <Button
          className="native-referee-match"
          key={match.matchId}
          onClick={() => void openMatch(match.matchId, match.tournamentId)}
        >
          <View>
            <Text>{match.label}</Text>
            <Text>{match.roles.map((role) => officialRoleLabels[role] || role).join(' / ')}</Text>
          </View>
          <Text>{formatDate(match.scheduledStartAt)} ›</Text>
        </Button>
      ))}
      {editing && (
        <NativeDialog
          title="执裁特点介绍"
          compact={false}
          busy={busy}
          unsavedChanges={bio !== profile.bio}
          onClose={() => setEditing(false)}
          footer={
            <Button
              className="native-button native-button--primary"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                setError('')
                void refereeApi
                  .save(bio)
                  .then((next) => {
                    onChange(next)
                    setEditing(false)
                  })
                  .catch((issue) => setError(issue instanceof Error ? issue.message : '保存失败'))
                  .finally(() => setBusy(false))
              }}
            >
              保存
            </Button>
          }
        >
          <Textarea
            value={bio}
            maxlength={500}
            placeholder="介绍你的执裁风格、擅长的比赛或个人经历"
            onInput={(event) => setBio(event.detail.value)}
          />
          {error && <Text className="native-error">{error}</Text>}
        </NativeDialog>
      )}
    </View>
  )
}
