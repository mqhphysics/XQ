/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CommentResponseDto } from './CommentResponseDto';
import type { PostIdentityDto } from './PostIdentityDto';
import type { PostResponseTagDto } from './PostResponseTagDto';
import type { PostSummaryDto } from './PostSummaryDto';
import type { PostTeamDto } from './PostTeamDto';
export type PostDetailDto = {
    id: string;
    tournamentId?: string;
    tags: Array<PostResponseTagDto>;
    type: string;
    title: string | null;
    body: string;
    imageUrl: string | null;
    imageUrls: Array<string>;
    publishedAt: string;
    updatedAt: string;
    author: PostIdentityDto;
    team: PostTeamDto | null;
    likeCount: number;
    commentCount: number;
    likedByMe: boolean;
    favoritedByMe: boolean;
    quotedPostId: string | null;
    quotedPost: PostSummaryDto | null;
    publicationState: 'PUBLISHED' | 'PENDING_REVIEW';
    comments: Array<CommentResponseDto>;
};
