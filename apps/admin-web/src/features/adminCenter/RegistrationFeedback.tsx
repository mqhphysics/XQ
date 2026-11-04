import { useState } from 'react'
import type { OrganizationContext } from '../adminSchedule/types'
import {
  ActionForm,
  Badge,
  DataState,
  Modal,
  Pager,
  time,
  useAdminData,
  type PageData,
} from './shared'

type Item = {
  id: string
  realName: string | null
  studentNumber: string | null
  contactEmail: string | null
  details: string
  status: string
  resolution: string | null
  version: number
  createdAt: string
}
export function RegistrationFeedback({
  context,
  onChanged,
}: {
  context: OrganizationContext
  onChanged?: () => void
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<Item | null>(null)
  const result = useAdminData<PageData<Item>>(
    context,
    `/admin/center/registration-feedback?page=${page}&pageSize=20`,
  )
  return (
    <section className="mc-panel">
      <div className="mc-panel-heading">
        <div>
          <h2>注册问题</h2>
          <p>未注册同学的反馈也会出现在这里；可核对姓名、提交学号及联系邮箱。</p>
        </div>
        <button className="secondary-button" onClick={result.refresh}>
          刷新
        </button>
      </div>
      <DataState loading={result.loading} error={result.error} onRetry={result.refresh} />
      {result.data && (
        <>
          {result.data.items.length ? (
            <div className="mc-table-wrap">
              <table className="mc-table">
                <thead>
                  <tr>
                    <th>姓名 / 提交学号</th>
                    <th>问题</th>
                    <th>联系邮箱</th>
                    <th>状态 / 时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.realName || '未填写'}</strong>
                        <br />
                        {item.studentNumber || '未填写学号'}
                      </td>
                      <td
                        style={{ maxWidth: 360, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                      >
                        {item.details}
                      </td>
                      <td>{item.contactEmail || '未填写'}</td>
                      <td>
                        <Badge value={item.status} />
                        <br />
                        {time(item.createdAt)}
                      </td>
                      <td>
                        <button className="secondary-button" onClick={() => setSelected(item)}>
                          查看处理
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mc-state">暂无注册问题反馈。</div>
          )}
          <Pager data={result.data} page={page} onPage={setPage} />
        </>
      )}
      {selected && (
        <Modal title="注册问题反馈" onClose={() => setSelected(null)}>
          <p>
            {selected.realName || '未填写姓名'} · {selected.studentNumber || '未填写学号'}
          </p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{selected.details}</p>
          <p>联系邮箱：{selected.contactEmail || '未填写'}</p>
          {selected.status === 'OPEN' ? (
            <ActionForm
              context={context}
              path={`/admin/center/registration-feedback/${selected.id}/decisions`}
              body={{ expectedVersion: selected.version }}
              submitLabel="标为已处理"
              onDone={() => {
                setSelected(null)
                result.refresh()
                onChanged?.()
              }}
            />
          ) : (
            <p>处理记录：{selected.resolution || '已处理'}</p>
          )}
        </Modal>
      )}
    </section>
  )
}
