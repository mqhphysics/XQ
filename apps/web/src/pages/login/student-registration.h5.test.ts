import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyStudentRegistration, studentRegistrationErrors } from './student-registration.h5.ts'

test('student registration accepts only the requested required fields, without username or nickname', () => {
  const form = {
    ...emptyStudentRegistration,
    realName: '学生甲',
    studentId: '2099990001',
    password: '123456',
    confirmPassword: '123456',
  }
  assert.deepEqual(studentRegistrationErrors(form), {})
  assert.equal('username' in form, false)
  assert.equal('displayName' in form, false)
})
test('email, complete student number and confirmation errors are assigned to their own fields', () => {
  const errors = studentRegistrationErrors({
    ...emptyStudentRegistration,
    realName: '学生甲',
    studentId: '20999900011',
    email: 'invalid',
    password: '123456',
    confirmPassword: '654321',
  })
  assert(errors.email)
  assert(errors.studentId)
  assert(errors.confirmPassword)
})
