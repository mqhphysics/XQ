export interface StudentRegistrationForm {
  realName: string
  studentId: string
  email: string
  emailCode: string
  password: string
  confirmPassword: string
}
export const emptyStudentRegistration: StudentRegistrationForm = {
  realName: '',
  studentId: '',
  email: '',
  emailCode: '',
  password: '',
  confirmPassword: '',
}
export function validRegistrationEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}
export function studentRegistrationErrors(form: StudentRegistrationForm) {
  const errors: Partial<Record<keyof StudentRegistrationForm, string>> = {}
  if (form.realName.trim().length < 2) errors.realName = '请填写姓名。'
  if (!/^20\d{8}$/.test(form.studentId.trim())) errors.studentId = '请填写以20开头的10位学号。'
  if (form.email.trim() && !validRegistrationEmail(form.email))
    errors.email = '邮箱格式不正确，请检查后重试。'
  if (form.email.trim() && !/^\d{6}$/.test(form.emailCode))
    errors.emailCode = '请填写邮件中的验证码。'
  if (form.password.length < 6 || form.password.length > 128)
    errors.password = '密码需为6至128位字符。'
  if (!form.confirmPassword) errors.confirmPassword = '请再次输入密码。'
  else if (form.confirmPassword !== form.password) errors.confirmPassword = '两次输入的密码不一致。'
  return errors
}
