import 'reflect-metadata'
import { resolve } from 'node:path'
import { loadMailEnvironment } from './mail-env'
import { MailService } from './mail.service'

loadMailEnvironment(resolve(__dirname, '../../../..'))
const mail = new MailService()
void mail
  .verifyConnection()
  .then(() => {
    console.log('SMTP_CONNECTION_AUTH_OK (no email sent; inbox delivery not yet verified)')
  })
  .catch((error: unknown) => {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
    console.error(
      code === 'EAUTH'
        ? 'SMTP_AUTH_FAILED: check SMTP service and authorization code'
        : /ETIMEDOUT|ECONNECTION|EDNS|ESOCKET/.test(code)
          ? 'SMTP_NETWORK_FAILED: check access to smtp.qq.com:465'
          : 'SMTP_CHECK_FAILED: check private-data/mail/.env.smtp; authorization code is never printed',
    )
    process.exitCode = 1
  })
