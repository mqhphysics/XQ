/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CampusMediaDto } from '../models/CampusMediaDto';
import type { CampusOnboardingDto } from '../models/CampusOnboardingDto';
import type { CampusPlayerDto } from '../models/CampusPlayerDto';
import type { CampusProfileDto } from '../models/CampusProfileDto';
import type { CampusReasonDto } from '../models/CampusReasonDto';
import type { CampusSeasonTeamDto } from '../models/CampusSeasonTeamDto';
import type { CampusVersionDto } from '../models/CampusVersionDto';
import type { ReporterAppealDto } from '../models/ReporterAppealDto';
import type { ReporterCaseDto } from '../models/ReporterCaseDto';
import type { ReporterReinstatementDto } from '../models/ReporterReinstatementDto';
import type { ReporterReinstateReviewDto } from '../models/ReporterReinstateReviewDto';
import type { ReporterReviewDto } from '../models/ReporterReviewDto';
import type { StudentAccountLinkDto } from '../models/StudentAccountLinkDto';
import type { StudentCatalogDto } from '../models/StudentCatalogDto';
import type { StudentPlayerLinkDto } from '../models/StudentPlayerLinkDto';
import type { StudentRecordDto } from '../models/StudentRecordDto';
import type { StudentRegistrationCorrectionDto } from '../models/StudentRegistrationCorrectionDto';
import type { StudentRegistrationListDto } from '../models/StudentRegistrationListDto';
import type { StudentRegistrationReviewDto } from '../models/StudentRegistrationReviewDto';
import type { StudentRegistrationSavedDto } from '../models/StudentRegistrationSavedDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CampusService {
    /**
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns StudentCatalogDto
     * @throws ApiError
     */
    public static campusControllerStudentOptions(
        idempotencyKey?: string,
    ): CancelablePromise<StudentCatalogDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/campus/student-options',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
        });
    }
    /**
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @param academicYear
     * @param collegeName
     * @param kind
     * @param page
     * @param cohort
     * @param query
     * @returns any
     * @throws ApiError
     */
    public static campusControllerStudentsList(
        idempotencyKey?: string,
        academicYear?: string,
        collegeName?: string,
        kind?: 'students' | 'users' | 'players',
        page?: number,
        cohort?: string,
        query?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/campus/students',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            query: {
                'academicYear': academicYear,
                'collegeName': collegeName,
                'kind': kind,
                'page': page,
                'cohort': cohort,
                'query': query,
            },
        });
    }
    /**
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerCreateStudent(
        requestBody: StudentRecordDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/students',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerStudent(
        id: string,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/campus/students/{id}',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerEditStudent(
        id: string,
        requestBody: StudentRecordDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/campus/students/{id}',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerLinkUser(
        id: string,
        requestBody: StudentAccountLinkDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/students/{id}/user',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerLinkPlayer(
        id: string,
        requestBody: StudentPlayerLinkDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/students/{id}/player',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerEditUser(
        id: string,
        requestBody: CampusProfileDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/campus/users/{id}/profile',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerMe(
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/campus-profile',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerCreatePlayer(
        id: string,
        requestBody: CampusVersionDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/students/{id}/player-profile',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerEditPlayer(
        id: string,
        requestBody: CampusPlayerDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/campus/players/{id}/profile',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerUploadMedia(
        requestBody: CampusMediaDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/profile-media',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerOnboarding(
        requestBody: CampusOnboardingDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/campus/onboarding',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerMyQuality(
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/reporter-quality',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
        });
    }
    /**
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerReporters(
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/campus/reporters',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
        });
    }
    /**
     * @param id
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerCorrectionContext(
        id: string,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/matches/{id}/correction-context',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerCorrection(
        id: string,
        requestBody: ReporterCaseDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/matches/{id}/corrections',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerReviewCorrection(
        id: string,
        requestBody: ReporterReviewDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/corrections/{id}/review',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerAppeal(
        id: string,
        requestBody: ReporterAppealDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/reporter-corrections/{id}/appeal',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerApply(
        requestBody: ReporterReinstatementDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/reporter-reinstatements',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerReviewReinstatement(
        id: string,
        requestBody: ReporterReinstateReviewDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/reinstatements/{id}/review',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerCatalog(
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/campus/competitions',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
        });
    }
    /**
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @param tournamentId
     * @returns any
     * @throws ApiError
     */
    public static campusControllerTeamSeasons(
        idempotencyKey?: string,
        tournamentId?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/campus/team-seasons',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            query: {
                'tournamentId': tournamentId,
            },
        });
    }
    /**
     * @param id
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerSaveTeamSeason(
        id: string,
        requestBody: CampusSeasonTeamDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/admin/campus/team-seasons/{id}',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param seasonId
     * @param requestBody
     * @param idempotencyKey 写操作必填，8–128字符；读取可省略
     * @returns any
     * @throws ApiError
     */
    public static campusControllerCreateInstance(
        id: string,
        seasonId: string,
        requestBody: CampusReasonDto,
        idempotencyKey?: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/competitions/{id}/seasons/{seasonId}',
            path: {
                'id': id,
                'seasonId': seasonId,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * 读取独立赛事目录与赛季，可用组合与空组合明确区分
     * @param xOrganizationId
     * @returns any
     * @throws ApiError
     */
    public static campusPublicControllerCatalog(
        xOrganizationId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/public/competition-catalog',
            headers: {
                'X-Organization-Id': xOrganizationId,
            },
        });
    }
    /**
     * @param authorization
     * @returns StudentRegistrationListDto
     * @throws ApiError
     */
    public static studentRegistrationControllerAdmin(
        authorization: string,
    ): CancelablePromise<StudentRegistrationListDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/admin/campus/registrations',
            headers: {
                'authorization': authorization,
            },
        });
    }
    /**
     * @param authorization
     * @returns StudentRegistrationListDto
     * @throws ApiError
     */
    public static studentRegistrationControllerMine(
        authorization: string,
    ): CancelablePromise<StudentRegistrationListDto> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/me/campus/registration',
            headers: {
                'authorization': authorization,
            },
        });
    }
    /**
     * @param idempotencyKey 8–128字符的幂等键
     * @param requestBody
     * @returns StudentRegistrationSavedDto
     * @throws ApiError
     */
    public static studentRegistrationControllerCorrect(
        idempotencyKey: string,
        requestBody: StudentRegistrationCorrectionDto,
    ): CancelablePromise<StudentRegistrationSavedDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/me/campus/registration',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * @param id
     * @param idempotencyKey 8–128字符的幂等键
     * @param requestBody
     * @returns StudentRegistrationSavedDto
     * @throws ApiError
     */
    public static studentRegistrationControllerReview(
        id: string,
        idempotencyKey: string,
        requestBody: StudentRegistrationReviewDto,
    ): CancelablePromise<StudentRegistrationSavedDto> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/admin/campus/registrations/{id}/review',
            path: {
                'id': id,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}
