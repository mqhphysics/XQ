import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { StudentRecordDto } from './campus.dto'

const student = { realName: '学生甲', gender: 'UNSPECIFIED', reason: '根据报名资料补录' }

test('student without a provided number can be created without inventing one', async () => {
  for (const studentNumber of [undefined, null, '']) {
    const dto = plainToInstance(StudentRecordDto, { ...student, studentNumber })
    assert.deepEqual(await validate(dto), [])
    assert.equal(dto.studentNumber ?? null, null)
  }
})

test('provided student numbers still require the original ten digit contract', async () => {
  assert.deepEqual(
    await validate(plainToInstance(StudentRecordDto, { ...student, studentNumber: '2026000001' })),
    [],
  )
  for (const studentNumber of ['202600001', '12345678901', '202600000x', '1234567890']) {
    assert.ok(
      (await validate(plainToInstance(StudentRecordDto, { ...student, studentNumber }))).some(
        (error) => error.property === 'studentNumber',
      ),
    )
  }
})

test('student colleges accept official full names and refuse arbitrary or truncated labels', async () => {
  const accepted = plainToInstance(StudentRecordDto, {
    ...student,
    collegeName: '物理科学与技术学院',
    academicYear: '2025级',
  })
  assert.deepEqual(await validate(accepted), [])
  for (const collegeName of ['随便填写的学院', '物理科学与...（截断）'])
    assert(
      (await validate(plainToInstance(StudentRecordDto, { ...student, collegeName }))).some(
        (e) => e.property === 'collegeName',
      ),
    )
})
