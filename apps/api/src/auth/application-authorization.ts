import { SetMetadata } from '@nestjs/common'

export const APPLICATION_AUTHORIZATION = 'xiaoqiu:application-authorization'

/** The handler's application service MUST requireSession and enforce its object policy. */
export function AuthorizeInApplicationService(): MethodDecorator & ClassDecorator {
  return SetMetadata(APPLICATION_AUTHORIZATION, true)
}
