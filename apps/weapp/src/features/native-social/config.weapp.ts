/** User authoring is retired. Official content and system notifications remain readable. */
export const nativeSocialConfig = {
  enabled: false,
  publishPosts: false,
  postComments: false,
  matchComments: false,
  privateMessages: false,
}
export type NativeWriteFeature = Exclude<keyof typeof nativeSocialConfig, 'enabled'>
export function nativeWriteEnabled(feature: NativeWriteFeature, config = nativeSocialConfig) {
  return config.enabled && config[feature]
}
