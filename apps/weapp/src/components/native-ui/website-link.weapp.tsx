import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './website-link.weapp.scss'

const websiteUrl = 'https://xiaoqiu-beta.pages.dev/'

export function NativeWebsiteLink() {
  const copy = () => {
    void Taro.setClipboardData({ data: websiteUrl }).catch(() => {
      void Taro.showToast({ title: '复制失败，请重试', icon: 'none' })
    })
  }
  return (
    <View className="native-website-link">
      <Button className="native-website-link__address" onClick={copy} aria-label="复制晓球网站网址">
        <Text>晓球网站：</Text>
        <Text className="native-website-link__url">xiaoqiu-beta.pages.dev</Text>
      </Button>
    </View>
  )
}
