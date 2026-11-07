/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RegistrationApplicantDto } from './RegistrationApplicantDto';
import type { StudentRegistrationCandidateDto } from './StudentRegistrationCandidateDto';
export type StudentRegistrationItemDto = {
    id: string;
    version: number;
    status: string;
    realName: string;
    studentNumber: string;
    reason: string;
    decisionNote: string | null;
    createdAt: string;
    user: RegistrationApplicantDto;
    candidates?: Array<StudentRegistrationCandidateDto>;
    currentStudentRecordId: string | null;
};
