import 'reflect-metadata'
import assert from 'node:assert/strict'
import test from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { LoginDto, RegisterDto, ResetPasswordByIdentityDto } from './auth.dto'
import { EmailPasswordResetDto } from './email-auth.dto'

const identity = { realName: '虚构姓名', studentId: '2026990011' }
test('registration and both recovery DTOs allow six arbitrary characters and reject five', () => {
  for (const password of ['123456', 'abcdef', '......', '中文密码六个', '😀😀😀😀😀😀', '      ']) {
    const registration = plainToInstance(RegisterDto, {
      ...identity,
      username: 'fictional',
      displayName: '虚构昵称',
      password,
    })
    const recovery = plainToInstance(ResetPasswordByIdentityDto, {
      ...identity,
      newPassword: password,
    })
    const email = plainToInstance(EmailPasswordResetDto, {
      email: 'fictional@example.test',
      emailCode: '123456',
      newPassword: password,
    })
    const login = plainToInstance(LoginDto, { username: 'fictional', password })
    assert.deepEqual(validateSync(registration), [])
    assert.deepEqual(validateSync(recovery), [])
    assert.deepEqual(validateSync(email), [])
    assert.deepEqual(validateSync(login), [])
  }
  for (const password of ['12345', '😀😀😀😀😀']) {
    assert.ok(
      validateSync(
        plainToInstance(RegisterDto, {
          ...identity,
          username: 'fictional',
          displayName: '虚构昵称',
          password,
        }),
      ).some((issue) => issue.property === 'password'),
    )
    assert.ok(
      validateSync(
        plainToInstance(ResetPasswordByIdentityDto, { ...identity, newPassword: password }),
      ).some((issue) => issue.property === 'newPassword'),
    )
    assert.ok(
      validateSync(
        plainToInstance(EmailPasswordResetDto, {
          email: 'fictional@example.test',
          emailCode: '123456',
          newPassword: password,
        }),
      ).some((issue) => issue.property === 'newPassword'),
    )
  }
})
