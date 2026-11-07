import assert from 'node:assert/strict'
import test from 'node:test'
import {
  missingRegistrationMessage,
  nativeRegistrationPayload,
  registrationErrors,
  requiredRegistrationFields,
} from './registration.logic.ts'

const valid = {
  realName: '测试同学',
  studentId: '2026990001',
  password: 'ExamplePassword2026!',
  confirmPassword: 'ExamplePassword2026!',
  email: '',
}
test('exactly ten numeric student digits are required, without silently truncating an extra digit', () => {
  for (const studentId of ['123', '12345678901', '123456789x', '1234567890'])
    assert.ok(registrationErrors({ ...valid, studentId }).studentId)
  assert.equal(registrationErrors(valid).studentId, undefined)
})
test('email is optional in the native form and required-field feedback names missing fields', () => {
  assert.deepEqual(registrationErrors(valid), {})
  assert.equal(requiredRegistrationFields.includes('email' as never), false)
  assert.equal(
    missingRegistrationMessage({ ...valid, realName: '', studentId: '' }),
    '姓名、学号还未填写',
  )
})

test('native registration sends the simplified website contract and lets the server assign a nickname', () => {
  assert.deepEqual(nativeRegistrationPayload(valid, ''), {
    realName: valid.realName,
    studentId: valid.studentId,
    password: valid.password,
  })
  assert.deepEqual(nativeRegistrationPayload({ ...valid, email: ' test@example.com ' }, '123456'), {
    realName: valid.realName,
    studentId: valid.studentId,
    password: valid.password,
    email: 'test@example.com',
    emailCode: '123456',
  })
  assert.deepEqual(requiredRegistrationFields, [
    'realName',
    'studentId',
    'password',
    'confirmPassword',
  ])
})
test('mismatched passwords and supplied malformed mail are reported on their fields', () => {
  assert.ok(registrationErrors({ ...valid, confirmPassword: 'different' }).confirmPassword)
  assert.ok(registrationErrors({ ...valid, email: 'bad-email' }).email)
})

test('passwords accept any six characters and reject five without trimming or mixing requirements', () => {
  for (const password of ['123456', 'abcdef', '......', '中文密码六个', '😀😀😀😀😀😀', '      ']) {
    assert.deepEqual(registrationErrors({ ...valid, password, confirmPassword: password }), {})
    assert.equal(missingRegistrationMessage({ ...valid, password, confirmPassword: password }), '')
  }
  for (const password of ['12345', '😀😀😀😀😀'])
    assert.ok(registrationErrors({ ...valid, password, confirmPassword: password }).password)
})
