import { request, createClientActionId } from '../product/product.repository'
import type {
  ReportWorkspaceResponseDto,
  WriteMatchReportDto,
} from '../../../../../packages/api-client/src/generated/index'
export type {
  ReportWorkspaceResponseDto as ReportWorkspace,
  ReportFieldsDto as ReportFields,
  ReportEventDto as ReportEvent,
} from '../../../../../packages/api-client/src/generated/index'
export const reportId = () => createClientActionId('report')
export const nativeReportApi = {
  load: (id: string) =>
    request<ReportWorkspaceResponseDto>(`/matches/${encodeURIComponent(id)}/report`, {
      refresh: true,
    }),
  begin: (id: string) =>
    request<ReportWorkspaceResponseDto>(`/matches/${encodeURIComponent(id)}/report/editor`, {
      method: 'POST',
      data: { clientActionId: reportId() },
    }),
  save: (id: string, data: WriteMatchReportDto) =>
    request<ReportWorkspaceResponseDto>(`/matches/${encodeURIComponent(id)}/report`, {
      method: 'POST',
      data,
    }),
  requestChange: (id: string, reason: string) =>
    request<ReportWorkspaceResponseDto>(
      `/matches/${encodeURIComponent(id)}/report/change-requests`,
      { method: 'POST', data: { clientActionId: reportId(), reason } },
    ),
}
