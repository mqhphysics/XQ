import { Button, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { NativeDialog } from './index.weapp'

export function NativePrivacyNotice({ onClose }: { onClose: () => void }) {
  return (
    <NativeDialog title="个人信息与隐私说明" onClose={onClose}>
      <Text className="native-note">
        姓名和学号用于核对学生名册、处理身份申请，姓名也用于生成拼音加编号的登录用户名；旧登录名保留兼容。邮箱选填，填写后用于验证码、账号登录与找回。昵称、头像、简介及主动上传的资料会按功能展示，正式赛事名单与赛果由授权人员维护。
      </Text>
      <Text className="native-note">
        照片只在你主动选择后用于对应资料。点赞、收藏、打卡、反馈和使用记录用于提供相应功能；推荐功能会记录内容曝光、阅读时长及近期浏览的比赛，用于推荐你关注的内容和赛事。设备中保留登录状态、读取缓存及按账号隔离的操作草稿。
      </Text>
      <Text className="native-note">
        发布的动态、评论和转发会按内容状态展示；私信用于站内收发，消息提醒设置和拉黑关系用于控制提醒与互动，投诉处理由有权限的管理员进行。发布内容和上传图片继续受审核及举报处理规则约束。
      </Text>
      <Text className="native-note">
        你可以修改个人资料，或在设置中提交账号注销与个人信息删除申请。管理员核验后处理；申请提交不等于立即删除，正式赛事记录的保留范围需在处理时说明。不要在反馈中提交密码或验证码。
      </Text>
      <Button
        className="native-button"
        onClick={() =>
          Taro.openPrivacyContract({
            fail: () => {
              void Taro.showToast({ title: '平台隐私指引暂不可用，请稍后重试', icon: 'none' })
            },
          })
        }
      >
        查看微信隐私保护指引
      </Button>
    </NativeDialog>
  )
}
