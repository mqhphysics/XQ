import { useEffect, useRef, useState } from 'react'
import type { WorkflowProps } from './types'
import { workflowRequest } from './client'
import './sheet-recognition.css'

type Person = { shirtNumber?: string; playerName?: string }
type SheetEvent = Person & { kind: string; side: string; minute?: number | null; addedMinute?: number | null; relatedShirtNumber?: string; relatedPlayerName?: string }
type Sheet = { date: string; homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; events: SheetEvent[]; starters: { HOME: Person[]; AWAY: Person[] }; notes: string; warnings: string[] }
const kinds = { GOAL: '进球', OWN_GOAL: '乌龙球', YELLOW_CARD: '黄牌', RED_CARD: '红牌', SUBSTITUTION: '换人' }
const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(Error('图片读取失败，请重新选择。'))
  reader.readAsDataURL(file)
})

export function SheetRecognition({ context, matchId, disabled, onChange }: {
  context: WorkflowProps['context']; matchId: string; disabled: boolean; onChange: (value: string) => void
}) {
  const [files, setFiles] = useState<Array<{ name: string; url: string; size: number }>>([])
  const [notes, setNotes] = useState('')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const request = useRef<AbortController | null>(null)
  const readingRef = useRef(false)
  useEffect(() => () => { request.current?.abort() }, [])
  const update = (next: Sheet) => { setSheet(next); onChange(JSON.stringify(next)); setError('') }
  const choose = async (list: FileList | null) => {
    if (!list?.length || disabled || request.current || readingRef.current) return
    readingRef.current = true; setReading(true); setError('')
    try {
      const added = [...list]
      if (files.length + added.length > 3) throw Error('一场比赛最多选择3张四官表，可先移除不需要的图片。')
      if (added.some(f => !/^image\/(jpeg|png|webp)$/.test(f.type) || !f.size || f.size > 4 * 1024 * 1024)) throw Error('请选择4MB以内的JPEG、PNG或WebP图片。')
      if (files.reduce((sum, f) => sum + f.size, 0) + added.reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024) throw Error('本次图片总计最多10MB，请减少图片。')
      const next = await Promise.all(added.map(async f => ({ name: f.name, size: f.size, url: await readImage(f) })))
      setFiles(previous => [...previous, ...next]); setSheet(null); onChange(''); setMessage('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '图片读取失败。') }
    finally { readingRef.current = false; setReading(false); if (picker.current) picker.current.value = '' }
  }
  const recognize = async () => {
    if (disabled || readingRef.current || request.current || !files.length) return
    const controller = new AbortController(); request.current = controller
    setSheet(null); onChange('')
    setBusy(true); setError(''); setMessage('正在读取图片并整理比赛信息，通常需要几十秒…')
    try {
      const result = await workflowRequest<{ sheet: Sheet; model: string }>(context, `/matches/${matchId}/report/recognize-sheet`, {
        method: 'POST', body: { images: files.map(f => f.url), notes }, signal: controller.signal, timeoutMs: 65_000,
      })
      if (controller.signal.aborted) return
      update(result.sheet)
      setMessage('识别完成，请逐项核对；可在下方直接修改。比赛记录尚未保存。')
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : '识别失败，请重试。'); setMessage('') }
    } finally { if (request.current === controller) request.current = null; setBusy(false) }
  }
  const locked = disabled || busy || reading
  const field = (label: string, value: string | number | null | undefined, change: (value: string) => void, type = 'text') => (
    <label className="mc-field"><span>{label}</span><input type={type} value={value ?? ''} disabled={locked} onChange={e => change(e.target.value)} {...(type === 'number' ? { min: 0, max: 99 } : {})} /></label>
  )
  return <section className="sheet-recognition" aria-label="四官表图片识别" aria-busy={busy}>
    <div className="sheet-recognition-heading"><div><h3>上传四官表</h3><p>读取比赛信息，核对后保存。</p></div><span className="sheet-private-badge">原表仅用于识别</span></div>
    <div className={`sheet-image-drop${dragging ? ' is-dragging' : ''}`}
      onDragOver={e => { e.preventDefault(); if (!locked) setDragging(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
      onDrop={e => { e.preventDefault(); setDragging(false); void choose(e.dataTransfer.files) }}>
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 3h8l4 4v14H5V3h2ZM14 3v5h5M8 13h8M8 17h5" /></svg>
      <strong>{dragging ? '松开以添加四官表' : '把本场四官表拖到这里'}</strong>
      <span>支持正反面 · JPEG、PNG、WebP · 最多3张，每张4MB</span>
      <button type="button" className="secondary-button" disabled={locked} onClick={() => picker.current?.click()}>{reading ? '正在读取…' : files.length ? '继续添加图片' : '选择图片'}</button>
      <input ref={picker} className="sheet-file-input" aria-label="选择四官表图片" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked} onChange={e => void choose(e.target.files)} />
    </div>
    {files.length > 0 && <div className="sheet-image-list">{files.map((file, index) => <figure key={`${index}/${file.name}`}>
      <a href={file.url} target="_blank" rel="noreferrer" aria-label={`查看原表：${file.name}`}><img src={file.url} alt={`四官表 ${index + 1}`} /></a>
      <figcaption title={file.name}>{file.name}</figcaption>
      <button type="button" className="secondary-button" disabled={locked} aria-label={`移除四官表 ${index + 1}`} onClick={() => { setFiles(old => old.filter((_, i) => i !== index)); setSheet(null); onChange(''); setMessage('') }}>移除</button>
    </figure>)}</div>}
    <label className="mc-field"><span>识别备注（选填）</span><textarea rows={2} maxLength={800} disabled={locked} placeholder="例如：第二张是背面；某处字迹需要特别核对" value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <div className="sheet-recognition-actions"><button type="button" disabled={locked || !files.length} onClick={() => void recognize()}>{busy ? '正在识别…' : sheet ? '重新识别' : '识别比赛信息'}</button><span>识别后由你确认保存，原表不会用作公开配图。</span></div>
    <p className="sheet-recognition-status" role="status" aria-live="polite">{message}</p>
    {error && <p className="mc-alert" role="alert">{error}</p>}
    {sheet && <section className="sheet-recognition-review" aria-label="编辑识别结果"><h3>核对识别结果</h3>
      <div className="sheet-review-grid">
        {field('比赛日期', sheet.date, value => update({ ...sheet, date: value }), 'date')}
        {field('主队', sheet.homeTeam, value => update({ ...sheet, homeTeam: value }))}
        {field('客队', sheet.awayTeam, value => update({ ...sheet, awayTeam: value }))}
        {field('主队比分', sheet.homeScore, value => update({ ...sheet, homeScore: value === '' ? null : Number(value) }), 'number')}
        {field('客队比分', sheet.awayScore, value => update({ ...sheet, awayScore: value === '' ? null : Number(value) }), 'number')}
      </div>
      {sheet.warnings.length > 0 && <div className="mc-alert"><strong>待核对</strong>{sheet.warnings.map((warning, i) => <p key={i}>{warning}{' '}<button type="button" className="secondary-button" disabled={locked} aria-label={`标记已核对：${warning}`} onClick={() => update({ ...sheet, warnings: sheet.warnings.filter((_, index) => index !== i) })}>已核对</button></p>)}</div>}
      <h4>比赛事件</h4><p className="mc-muted">换人填写下场者及上场者；进球的关联球员仅填写明确的助攻者。分钟不确定时留空。</p>
      <div className="sheet-event-scroll"><table className="sheet-event-table"><thead><tr>{['类型','球队','分钟','补时','号码','姓名','关联号码','关联姓名','操作'].map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>
        {sheet.events.map((event, index) => { const edit = (key: string, value: unknown) => update({ ...sheet, events: sheet.events.map((old, i) => i === index ? { ...old, [key]: value } : old) }); return <tr key={index}>
          <td><select aria-label={`事件${index + 1}类型`} disabled={locked} value={event.kind} onChange={e => edit('kind', e.target.value)}>{Object.entries(kinds).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></td>
          <td><select aria-label={`事件${index + 1}球队`} disabled={locked} value={event.side} onChange={e => edit('side', e.target.value)}><option value="HOME">主队</option><option value="AWAY">客队</option></select></td>
          {(['minute','addedMinute','shirtNumber','playerName','relatedShirtNumber','relatedPlayerName'] as const).map((key, k) => <td key={key}><input aria-label={`事件${index + 1}${['分钟','补时','号码','姓名','关联号码','关联姓名'][k]}`} type={k < 2 ? 'number' : 'text'} min={0} max={k === 0 ? 120 : 30} value={event[key] ?? ''} disabled={locked} onChange={e => edit(key, k < 2 ? e.target.value === '' ? null : Number(e.target.value) : e.target.value)} /></td>)}
          <td><button type="button" className="secondary-button" aria-label={`删除事件${index + 1}`} disabled={locked} onClick={() => update({ ...sheet, events: sheet.events.filter((_, i) => i !== index) })}>删除</button></td>
        </tr> })}
      </tbody></table></div>
      {!sheet.events.length && <p className="mc-muted">暂未识别到事件，可按原表补充。</p>}
      <button type="button" className="secondary-button" disabled={locked || sheet.events.length >= 500} onClick={() => update({ ...sheet, events: [...sheet.events, { kind: 'GOAL', side: 'HOME', minute: null, shirtNumber: '', playerName: '' }] })}>添加事件</button>
      <div className="sheet-starter-grid">{(['HOME','AWAY'] as const).map(side => <section key={side}><h4>{side === 'HOME' ? '主队首发' : '客队首发'}</h4>{sheet.starters[side].map((person, index) => <div className="sheet-starter-row" key={index}>{(['shirtNumber','playerName'] as const).map(key => <input key={key} aria-label={`${side === 'HOME' ? '主队' : '客队'}首发${index + 1}${key === 'shirtNumber' ? '号码' : '姓名'}`} placeholder={key === 'shirtNumber' ? '号码' : '姓名'} disabled={locked} value={person[key] ?? ''} onChange={e => update({ ...sheet, starters: { ...sheet.starters, [side]: sheet.starters[side].map((p, i) => i === index ? { ...p, [key]: e.target.value } : p) } })} />)}<button type="button" className="secondary-button" disabled={locked} aria-label={`删除${side === 'HOME' ? '主队' : '客队'}首发${index + 1}`} onClick={() => update({ ...sheet, starters: { ...sheet.starters, [side]: sheet.starters[side].filter((_, i) => i !== index) } })}>移除</button></div>)}<button type="button" className="secondary-button" disabled={locked || sheet.starters[side].length >= 11} onClick={() => update({ ...sheet, starters: { ...sheet.starters, [side]: [...sheet.starters[side], { shirtNumber: '', playerName: '' }] } })}>添加首发</button></section>)}</div>
      <label className="mc-field"><span>录入说明</span><textarea rows={3} maxLength={800} value={sheet.notes} disabled={locked} onChange={e => update({ ...sheet, notes: e.target.value })} /></label>
    </section>}
  </section>
}
