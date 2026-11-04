/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminTeamRegistrationDetailResponseDto } from '../models/AdminTeamRegistrationDetailResponseDto';
import type { AdminTeamRegistrationListResponseDto } from '../models/AdminTeamRegistrationListResponseDto';
import type { PublicTournamentTeamDetailResponseDto } from '../models/PublicTournamentTeamDetailResponseDto';
import type { PublicTournamentTeamListResponseDto } from '../models/PublicTournamentTeamListResponseDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class RosterService {
    /**
     * 读取已发布赛事中已批准球队和锁定名单摘要
     * @param tournamentId
     * @param xOrganizationId 公开组织选择；由服务端校验。登录会话须与所选组织一致
     * @returns PublicTournamentTeamListResponseDto
     * @throws ApiError
     */
    public static rosterControllerListPublicTournamentTeams(
        tournamentId: string,
        xOrganizationId?: string,
    ): CancelablePromise<PublicTournamentTeamListResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/tournaments/{tournamentId}/teams',
            path: {
                'tournamentId': tournamentId,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取已发布赛事球队和最新锁定公开名单
     * @param tournamentId
     * @param teamId
     * @param xOrganizationId 公开组织选择；由服务端校验。登录会话须与所选组织一致
     * @returns PublicTournamentTeamDetailResponseDto
     * @throws ApiError
     */
    public static rosterControllerGetPublicTournamentTeam(
        tournamentId: string,
        teamId: string,
        xOrganizationId?: string,
    ): CancelablePromise<PublicTournamentTeamDetailResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/tournaments/{tournamentId}/teams/{teamId}',
            path: {
                'tournamentId': tournamentId,
                'teamId': teamId,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 管理员读取本组织获授权赛事的球队报名与名单核对列表
     * @param tournamentId
     * @returns AdminTeamRegistrationListResponseDto
     * @throws ApiError
     */
    public static rosterControllerListAdminTeamRegistrations(
        tournamentId: string,
    ): CancelablePromise<AdminTeamRegistrationListResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/tournaments/{tournamentId}/team-registrations',
            path: {
                'tournamentId': tournamentId,
            },
        });
    }
    /**
     * 管理员读取本组织获授权赛事的报名和脱敏名单详情
     * @param tournamentId
     * @param registrationId
     * @returns AdminTeamRegistrationDetailResponseDto
     * @throws ApiError
     */
    public static rosterControllerGetAdminTeamRegistration(
        tournamentId: string,
        registrationId: string,
    ): CancelablePromise<AdminTeamRegistrationDetailResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/tournaments/{tournamentId}/team-registrations/{registrationId}',
            path: {
                'tournamentId': tournamentId,
                'registrationId': registrationId,
            },
        });
    }
}
