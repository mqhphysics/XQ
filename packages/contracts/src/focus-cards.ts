import { fixtureRoundKind } from './fixture-round'

export type FocusCardMatch = {
  id: string
  status: string
  statusReason?: string | null
  title: string
  matchCode: string
  roundName?: string | null
  focusGender?: string
  scheduledStartAt: string | null
}

export function focusCardGender(value: string) {
  return /WOMEN|FEMALE|女/i.test(value) ? 'WOMEN' : /MEN|MALE|男/i.test(value) ? 'MEN' : ''
}

export const focusFinished = (status: string) => status === 'FINISHED' || status === 'CONFIRMED'
export const focusPending = (status: string) => ['SCHEDULED', 'CHECK_IN', 'LIVE'].includes(status)
export const focusVisible = (match: Pick<FocusCardMatch, 'status' | 'statusReason'>) =>
  (focusFinished(match.status) || focusPending(match.status)) &&
  !match.statusReason?.startsWith('组委会裁定')

/** Input order ranks candidates within each card. Keep the two status slots independent. */
export function selectFocusCards<T extends FocusCardMatch>(ranked: T[]): T[] {
  const matches = [
    ...new Map(ranked.filter(focusVisible).map((match) => [match.id, match])).values(),
  ]
  const finished = matches.filter((match) => focusFinished(match.status))
  const pending = matches.filter((match) => focusPending(match.status))
  if (pending.length) {
    const right = pending.find((match) => match.status !== 'LIVE') ?? pending[0]!
    return finished.length ? [finished[0]!, right] : [right]
  }
  const finals = finished.filter((match) => fixtureRoundKind(match) === 'final')
  const finalFor = (gender: string) =>
    finals.find(
      (match) =>
        focusCardGender(match.focusGender || '') === gender ||
        (!focusCardGender(match.focusGender || '') &&
          focusCardGender(match.matchCode + ' ' + match.title) === gender),
    )
  const men = finalFor('MEN'),
    women = finalFor('WOMEN')
  if (men && women) return [men, women]
  return [...new Map([...finals, ...finished].map((match) => [match.id, match])).values()].slice(
    0,
    2,
  )
}
