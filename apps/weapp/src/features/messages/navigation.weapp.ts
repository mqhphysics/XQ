import { openNativeDetail, switchNativeSection } from '../native-navigation/index.weapp'
import { queueProfileEntry } from '../product/profile-entry.weapp'

export async function openMessageTarget(url: string | null | undefined) {
  if (!url?.startsWith('/pages/')) return
  if (url.startsWith('/pages/me/')) {
    await switchNativeSection('me')
    queueProfileEntry(url)
  } else if (url.startsWith('/pages/my-team/')) await switchNativeSection('team')
  else await openNativeDetail(url)
}
