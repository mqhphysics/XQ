/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PostIdentityDto = {
    id: string;
    displayName: string;
    verificationLevel: string;
    avatarUrl: string | null;
    coverUrl?: string | null;
    roles: Array<string>;
    official: boolean;
    messageable: boolean;
    displayedBadgeKind?: string | null;
    showPlayerIdentity?: boolean;
};
