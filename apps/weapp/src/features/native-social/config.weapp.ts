/** UGC is enabled in 0.8.9; authorization and moderation remain server-owned. */
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
