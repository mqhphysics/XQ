import Taro from '@tarojs/taro'
import type { NativeSection } from './history.logic.weapp'
export function useNativeTournamentId(): string {
  return Taro.getCurrentInstance().router?.params.tournamentId || ''
}
export function setNativeTournamentId(_id?: string) {}
export function useNativeShell(_section: string, _detail: boolean, _tournamentId?: string) {
  return { index: 0, duration: 0, touchHandlers: {} }
}
export async function switchNativeSection(_section: NativeSection, _tournamentId?: string) {}
export async function nativeBack() {
  await Taro.navigateBack()
}
