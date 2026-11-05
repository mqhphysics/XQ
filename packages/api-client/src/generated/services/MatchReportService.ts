/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BeginMatchReportDto } from '../models/BeginMatchReportDto';
import type { ReportHistoryResponseDto } from '../models/ReportHistoryResponseDto';
import type { ReportOverviewResponseDto } from '../models/ReportOverviewResponseDto';
import type { ReportWorkspaceResponseDto } from '../models/ReportWorkspaceResponseDto';
import type { RequestMatchReportChangeDto } from '../models/RequestMatchReportChangeDto';
import type { WriteMatchReportDto } from '../models/WriteMatchReportDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class MatchReportService {
    /**
     * @param matchId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static matchReportControllerBegin(
        matchId: string,
        requestBody: BeginMatchReportDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/matches/{matchId}/report/editor',
            path: {
                'matchId': matchId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param matchId
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static matchReportControllerRequestChange(
        matchId: string,
        requestBody: RequestMatchReportChangeDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/matches/{matchId}/report/change-requests',
            path: {
                'matchId': matchId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取授权比赛的报告、固定名单/规程版本和可用操作
     * @param matchId
     * @returns ReportWorkspaceResponseDto
     * @throws ApiError
     */
    public static matchReportControllerGet(
        matchId: string,
    ): CancelablePromise<ReportWorkspaceResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/matches/{matchId}/report',
            path: {
                'matchId': matchId,
            },
        });
    }
    /**
     * 按期望版本幂等保存、提交、审核或启动结果修正
     * @param matchId
     * @param requestBody
     * @returns ReportWorkspaceResponseDto
     * @throws ApiError
     */
    public static matchReportControllerWrite(
        matchId: string,
        requestBody: WriteMatchReportDto,
    ): CancelablePromise<ReportWorkspaceResponseDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/matches/{matchId}/report',
            path: {
                'matchId': matchId,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 按不可变版本降序读取报告历史，不返回未保存草稿
     * @param matchId
     * @param beforeVersion
     * @param limit
     * @returns ReportHistoryResponseDto
     * @throws ApiError
     */
    public static matchReportControllerHistory(
        matchId: string,
        beforeVersion?: number,
        limit: number = 30,
    ): CancelablePromise<ReportHistoryResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/matches/{matchId}/report/history',
            path: {
                'matchId': matchId,
            },
            query: {
                'beforeVersion': beforeVersion,
                'limit': limit,
            },
        });
    }
    /**
     * 比赛录入列表：授权比赛的录入状态与已录比分
     * @param tournamentId
     * @returns ReportOverviewResponseDto
     * @throws ApiError
     */
    public static matchReportOverviewControllerOverview(
        tournamentId: string,
    ): CancelablePromise<ReportOverviewResponseDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/match-reports/overview',
            query: {
                'tournamentId': tournamentId,
            },
        });
    }
}
