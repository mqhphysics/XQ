/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PostIdentityDto } from './PostIdentityDto';
import type { PostSummaryDto } from './PostSummaryDto';
export type CommentResponseDto = {
    id: string;
    body: string;
    /**
     * 按上传顺序排列，无图为 []；隐藏、删除或原动态不可访问时图片停止公开。
     */
    imageUrls: Array<string>;
    parentCommentId: string | null;
    createdAt: string;
    updatedAt: string;
    author: PostIdentityDto;
    likeCount: number;
    likedByMe: boolean;
    repostedPost?: PostSummaryDto | null;
};
