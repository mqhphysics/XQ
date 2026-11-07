/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RegistrationCandidateUserDto } from './RegistrationCandidateUserDto';
export type StudentRegistrationCandidateDto = {
    id: string;
    realName: string;
    studentNumber: string | null;
    collegeName: string;
    version: number;
    user: RegistrationCandidateUserDto | null;
};
