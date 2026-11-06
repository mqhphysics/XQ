import Taro from '@tarojs/taro'
type NativeSection = 'home' | 'schedule' | 'team' | 'data' | 'me'
export function useNativeTournamentId(): string {
  return Taro.getCurrentInstance().router?.params.tournamentId || ''
}
export function setNativeTournamentId(_id?: string) {}
export function useNativeShell(_section: string, _detail: boolean, _tournamentId?: string) {
  return { index: 0, duration: 0, wide: false, touchHandlers: {} }
}
export async function switchNativeSection(_section: NativeSection, _tournamentId?: string) {}
export async function nativeBack() {
  await Taro.navigateBack()
}
