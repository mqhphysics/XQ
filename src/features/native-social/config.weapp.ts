/** Demo/community controls for WeChat only. Flip enabled to false for a read-only build. */
export const nativeSocialConfig = {
  enabled: true,
  publishPosts: true,
  postComments: true,
  matchComments: true,
  privateMessages: true,
}
export type NativeWriteFeature = Exclude<keyof typeof nativeSocialConfig, 'enabled'>
export function nativeWriteEnabled(feature: NativeWriteFeature, config = nativeSocialConfig) {
  return config.enabled && config[feature]
}
