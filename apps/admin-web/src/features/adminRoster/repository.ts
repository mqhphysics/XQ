import { requireAdminApi } from '../adminAuth/config'
import { AdminApiError, requestAdmin } from '../adminAuth/request'
import {
  mapRosterRegistrationDetailResponse,
  mapRosterRegistrationListResponse,
} from './admin-roster.logic'
import {
  AdminRosterRepositoryError,
  type AdminRosterContext,
  type AdminRosterRepository,
  type RosterRegistrationDetail,
  type RosterRegistrationReview,
  type RosterReviewTournament,
} from './types'

// Compatibility for the old workspace's unreachable explicit mock-mode branch.
// The factory always requires a configured API and never uses this fixture.
export const mockRosterTournament: RosterReviewTournament = {
  id: '00000000-0000-4000-8000-000000000301',
  code: 'mock-campus-cup',
  name: '虚构校园杯（开发数据）',
}

export function createAdminRosterRepository(): AdminRosterRepository {
  return new HttpAdminRosterRepository(requireAdminApi())
}

class HttpAdminRosterRepository implements AdminRosterRepository {
  readonly mode = 'api' as const
  constructor(readonly apiBaseUrl: string) {}

  async listRegistrations(
    context: AdminRosterContext,
    tournamentId: string,
  ): Promise<RosterRegistrationReview[]> {
    return mapRosterRegistrationListResponse(
      await this.request(
        context,
        `/admin/tournaments/${encodeURIComponent(tournamentId)}/team-registrations`,
      ),
    )
  }

  async getRegistration(
    context: AdminRosterContext,
    tournamentId: string,
    registrationId: string,
  ): Promise<RosterRegistrationDetail> {
    return mapRosterRegistrationDetailResponse(
      await this.request(
        context,
        `/admin/tournaments/${encodeURIComponent(tournamentId)}/team-registrations/${encodeURIComponent(registrationId)}`,
      ),
    )
  }

  private async request(context: AdminRosterContext, path: string): Promise<unknown> {
    try {
      return await requestAdmin(this.apiBaseUrl, context, path)
    } catch (error: unknown) {
      if (error instanceof AdminApiError)
        throw new AdminRosterRepositoryError(
          error.message,
          error.status,
          error.code,
          error.requestId,
        )
      throw new AdminRosterRepositoryError('无法读取名单，请稍后重试。', 0)
    }
  }
}
