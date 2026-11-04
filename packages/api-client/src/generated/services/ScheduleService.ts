/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminScheduleWorkbenchResponseDto } from '../models/AdminScheduleWorkbenchResponseDto';
import type { CompetitionRuleVersionResponseDto } from '../models/CompetitionRuleVersionResponseDto';
import type { CreateCompetitionRuleVersionDto } from '../models/CreateCompetitionRuleVersionDto';
import type { CreateMatchDto } from '../models/CreateMatchDto';
import type { CreateSchedulePlanDto } from '../models/CreateSchedulePlanDto';
import type { CreateSeasonDto } from '../models/CreateSeasonDto';
import type { CreateTeamDto } from '../models/CreateTeamDto';
import type { CreateTournamentDto } from '../models/CreateTournamentDto';
import type { CreateVenueDto } from '../models/CreateVenueDto';
import type { MatchResponseDto } from '../models/MatchResponseDto';
import type { PublicTournamentListResponseDto } from '../models/PublicTournamentListResponseDto';
import type { SchedulePlanResponseDto } from '../models/SchedulePlanResponseDto';
import type { ScheduleRevisionResponseDto } from '../models/ScheduleRevisionResponseDto';
import type { SeasonResponseDto } from '../models/SeasonResponseDto';
import type { TeamResponseDto } from '../models/TeamResponseDto';
import type { TournamentDetailResponseDto } from '../models/TournamentDetailResponseDto';
import type { TournamentResponseDto } from '../models/TournamentResponseDto';
import type { TournamentScheduleResponseDto } from '../models/TournamentScheduleResponseDto';
import type { VenueResponseDto } from '../models/VenueResponseDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ScheduleService {
    /**
     * 读取后台赛程工作台快照
     * @returns AdminScheduleWorkbenchResponseDto
     * @throws ApiError
     */
    public static scheduleControllerGetAdminScheduleWorkbench(): CancelablePromise<AdminScheduleWorkbenchResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/schedule-workbench',
        });
    }
    /**
     * 创建赛季
     * @param requestBody
     * @returns SeasonResponseDto
     * @throws ApiError
     */
    public static scheduleControllerCreateSeason(
        requestBody: CreateSeasonDto,
    ): CancelablePromise<SeasonResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/seasons',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 创建赛事
     * @param requestBody
     * @returns TournamentResponseDto
     * @throws ApiError
     */
    public static scheduleControllerCreateTournament(
        requestBody: CreateTournamentDto,
    ): CancelablePromise<TournamentResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/tournaments',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 创建赛事规则版本
     * @param id
     * @param requestBody
     * @returns CompetitionRuleVersionResponseDto
     * @throws ApiError
     */
    public static scheduleControllerCreateRuleVersion(
        id: string,
        requestBody: CreateCompetitionRuleVersionDto,
    ): CancelablePromise<CompetitionRuleVersionResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/tournaments/{id}/rule-versions',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 创建球队
     * @param id
     * @param requestBody
     * @returns TeamResponseDto
     * @throws ApiError
     */
    public static scheduleControllerCreateTeam(
        id: string,
        requestBody: CreateTeamDto,
    ): CancelablePromise<TeamResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/tournaments/{id}/teams',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 创建场地
     * @param requestBody
     * @returns VenueResponseDto
     * @throws ApiError
     */
    public static scheduleControllerCreateVenue(
        requestBody: CreateVenueDto,
    ): CancelablePromise<VenueResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/venues',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 创建比赛草案
     * @param id
     * @param requestBody
     * @returns MatchResponseDto
     * @throws ApiError
     */
    public static scheduleControllerCreateMatch(
        id: string,
        requestBody: CreateMatchDto,
    ): CancelablePromise<MatchResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/tournaments/{id}/matches',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 创建赛程草案
     * @param requestBody
     * @returns SchedulePlanResponseDto
     * @throws ApiError
     */
    public static scheduleControllerCreateSchedulePlan(
        requestBody: CreateSchedulePlanDto,
    ): CancelablePromise<SchedulePlanResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/schedule-plans',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 校验赛程草案
     * @param id
     * @returns SchedulePlanResponseDto
     * @throws ApiError
     */
    public static scheduleControllerValidateSchedulePlan(
        id: string,
    ): CancelablePromise<SchedulePlanResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/schedule-plans/{id}/validate',
            path: {
                'id': id,
            },
        });
    }
    /**
     * 发布赛程草案
     * @param id
     * @returns ScheduleRevisionResponseDto
     * @throws ApiError
     */
    public static scheduleControllerPublishSchedulePlan(
        id: string,
    ): CancelablePromise<ScheduleRevisionResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/schedule-plans/{id}/publish',
            path: {
                'id': id,
            },
        });
    }
    /**
     * 读取已发布赛事列表
     * @param xOrganizationId 组织 UUID；登录后默认使用会话组织，游客可使用部署默认组织
     * @returns PublicTournamentListResponseDto
     * @throws ApiError
     */
    public static scheduleControllerListPublicTournaments(
        xOrganizationId?: string,
    ): CancelablePromise<PublicTournamentListResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/tournaments',
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取已发布赛事详情
     * @param id
     * @param xOrganizationId 组织 UUID；登录后默认使用会话组织，游客可使用部署默认组织
     * @returns TournamentDetailResponseDto
     * @throws ApiError
     */
    public static scheduleControllerGetPublicTournament(
        id: string,
        xOrganizationId?: string,
    ): CancelablePromise<TournamentDetailResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/tournaments/{id}',
            path: {
                'id': id,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取已发布赛程
     * @param id
     * @param xOrganizationId 组织 UUID；登录后默认使用会话组织，游客可使用部署默认组织
     * @returns TournamentScheduleResponseDto
     * @throws ApiError
     */
    public static scheduleControllerGetPublicSchedule(
        id: string,
        xOrganizationId?: string,
    ): CancelablePromise<TournamentScheduleResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/tournaments/{id}/schedule',
            path: {
                'id': id,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取已发布比赛详情
     * @param id
     * @param xOrganizationId 组织 UUID；登录后默认使用会话组织，游客可使用部署默认组织
     * @returns MatchResponseDto
     * @throws ApiError
     */
    public static scheduleControllerGetPublicMatch(
        id: string,
        xOrganizationId?: string,
    ): CancelablePromise<MatchResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/matches/{id}',
            path: {
                'id': id,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
    /**
     * 读取球队详情
     * @param id
     * @param xOrganizationId 组织 UUID；登录后默认使用会话组织，游客可使用部署默认组织
     * @returns TeamResponseDto
     * @throws ApiError
     */
    public static scheduleControllerGetPublicTeam(
        id: string,
        xOrganizationId?: string,
    ): CancelablePromise<TeamResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/teams/{id}',
            path: {
                'id': id,
            },
            headers: {
                'x-organization-id': xOrganizationId,
            },
        });
    }
}
