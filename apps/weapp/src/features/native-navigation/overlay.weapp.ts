import Taro from '@tarojs/taro'
import { createLayerOwners } from './layer-owners.logic'

export const holdNativeOverlay = createLayerOwners((open) =>
  Taro.eventCenter.trigger('xiaoqiu:native-overlay', open),
)
