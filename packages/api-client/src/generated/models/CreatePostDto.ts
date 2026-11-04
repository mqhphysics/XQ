/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PostTagDto } from './PostTagDto';
export type CreatePostDto = {
    /**
     * 引用的已发布动态
     */
    quotedPostId?: string;
    /**
     * 客户端生成的动态发布幂等键
     */
    clientPostId: string;
    tournamentId?: string;
    tags?: Array<PostTagDto>;
    /**
     * 以球队成员身份发布球队动态
     */
    teamId?: string;
    title?: string;
    body: string;
    /**
     * 兼容旧客户端的单张 JPEG/PNG/WebP/GIF 图片，最大 4 MiB
     */
    imageDataUrl?: string;
    /**
     * 按展示顺序上传，最多 9 张；与 imageDataUrl 二选一
     */
    imageDataUrls?: Array<string>;
};

