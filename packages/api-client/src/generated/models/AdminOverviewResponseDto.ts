/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AdminOverviewAuditDto } from './AdminOverviewAuditDto';
import type { AdminOverviewCountsDto } from './AdminOverviewCountsDto';
import type { AdminOverviewOrganizationDto } from './AdminOverviewOrganizationDto';
export type AdminOverviewResponseDto = {
    organization: AdminOverviewOrganizationDto;
    counts: AdminOverviewCountsDto;
    recentAudit: Array<AdminOverviewAuditDto>;
    checkedAt: string;
};
