import type { InlineReportController } from './use-inline-report.h5'
export function MatchReportEntry({ editor }: { editor: InlineReportController }) {
  if (!editor.candidate || !editor.workspace?.inline?.editor) return null
  const { canStart, completed, changeRequested } = editor.workspace.inline
  const locked =
    !canStart &&
    editor.workspace.blockingReasons?.some((reason) => reason.includes('管理员在后台修正'))
  return (
    <button
      type="button"
      className="match-dialog__edit"
      disabled={
        editor.busy || editor.editing || locked || changeRequested || (!canStart && !completed)
      }
      title={editor.workspace.blockingReasons?.[0]}
      onClick={() => (completed && !canStart ? editor.openRequest() : void editor.start())}
    >
      {editor.editing
        ? '正在编辑'
        : locked
          ? '已锁定'
          : changeRequested
            ? '已申请修改'
            : completed && !canStart
              ? '申请修改'
              : editor.workspace.latest
                ? '继续编辑'
                : '编辑比赛'}
    </button>
  )
}
