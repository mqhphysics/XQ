import assert from 'node:assert/strict'
import test from 'node:test'
import { businessAuditSummary } from './admin-audit'

test('audit changes expose business fields while excluding credentials and arbitrary nested values', () => {
  assert.deepEqual(businessAuditSummary('Team', { fields: { name: '信息管理', shortName: '信管', password: 'secret', id: 'internal' } }),
    { name: '信息管理', shortName: '信管' })
  assert.deepEqual(businessAuditSummary('User', { displayName: '球迷', email: 'private', passwordHash: 'secret', bio: '热爱足球' }),
    { displayName: '球迷', bio: '热爱足球' })
  assert.deepEqual(businessAuditSummary('StudentRecord', { realName: '虚构学生', studentNumber: '2026000001', academicYear: '2026' }),
    { realName: '虚构学生', studentNumber: '2026000001', academicYear: '2026' })
})
