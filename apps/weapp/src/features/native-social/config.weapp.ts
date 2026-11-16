/** Public builds are read-only. Only explicitly built internal candidates expose authoring. */
export const nativeSocialConfig = {
  enabled: process.env.TARO_APP_UGC === '1',
  publishPosts: true,
  postComments: true,
  matchComments: true,
  privateMessages: true,
}
export type NativeWriteFeature = Exclude<keyof typeof nativeSocialConfig, 'enabled'>
export function nativeWriteEnabled(feature: NativeWriteFeature, config = nativeSocialConfig) {
  return config.enabled && config[feature]
}
