/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateCommentDto = {
    /**
     * 本人上传完成的分片图片标识；与内联图片互斥
     */
    imageUploadIds?: Array<string>;
    /**
     * 发表评论时同步发布引用原帖的动态，不带标签
     */
    repostToFeed?: boolean;
    /**
     * 客户端生成的评论幂等键
     */
    clientCommentId: string;
    /**
     * 回复的评论 ID
     */
    parentCommentId?: string;
    body: string;
    /**
     * JPEG/PNG/WebP/GIF，单张最大 4 MiB；GIF 保留动画。有图时正文可为空。
     */
    imageDataUrls?: Array<string>;
};
