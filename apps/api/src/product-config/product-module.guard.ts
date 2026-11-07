import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common'
import { ERROR_CODES } from '@xiaoqiu/contracts'
import type { ProductModuleId } from '@xiaoqiu/contracts'
import { ApiHttpException } from '../common/api-http.exception'
import type { RequestWithId } from '../common/request-context'
import { ProductConfigService, UNAVAILABLE_FEATURE_REASON } from './product-config.service'

/** Only registered, existing business route templates; never health/auth/config/media delivery. */
export function modulesForRoute(route: string): ProductModuleId[] {
  const path = route
    .replace(/^\/api\//i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
  if (path === 'public/home') return ['home']
  if (path === 'public/feed' || path === 'me/feed-events') return ['community']
  if (/^me\/image-transfers\/:[^/]+(?:\/parts\/:[^/]+)?$/.test(path)) return ['community']
  if (path === 'public/competition-catalog') return ['schedule']
  if (/^(?:public\/)?matches\/:[^/]+\/check-in$/.test(path)) return ['schedule']
  if (/^public\/matches\/:[^/]+\/clock$/.test(path)) return ['schedule']
  if (/^matches\/:[^/]+\/start$/.test(path)) return ['matchReporting']
  if (path.startsWith('admin/campus/')) return ['administration']
  if (path.startsWith('me/campus') || path.startsWith('me/reporter'))
    return ['identityApplications']
  if (/^matches\/:[^/]+\/(?:correction-context|corrections)$/.test(path)) return ['matchReporting']
  if (/^me\/identity(?:\/(?:applications|confirm))?$/.test(path)) return ['identityApplications']
  if (
    /^admin\/identity\/(?:applications(?:\/:[^/]+\/review)?|records(?:\/:[^/]+\/(?:revoke|verify-user))?)$/.test(
      path,
    )
  )
    return ['administration', 'identityApplications']
  if (path === 'public/seasons' || /^public\/tournaments(?:\/:[^/]+)?$/.test(path))
    return ['schedule']
  if (
    /^public\/tournaments\/:[^/]+\/schedule$/.test(path) ||
    /^public\/matches\/:[^/]+(?:\/experience)?$/.test(path)
  )
    return ['schedule']
  if (/^public\/tournaments\/:[^/]+\/competition-data$/.test(path)) return ['data']
  if (
    /^public\/(?:teams|players)\/:[^/]+(?:\/dashboard)?$/.test(path) ||
    /^public\/tournaments\/:[^/]+\/teams(?:\/:[^/]+)?$/.test(path)
  )
    return ['teams']
  if (
    /^public\/(?:posts(?:\/:[^/]+)?|post-tags)$/.test(path) ||
    /^community\/posts(?:\/:[^/]+\/(?:like|comments))?$/.test(path) ||
    /^matches\/:[^/]+\/reviews$/.test(path)
  )
    return ['community']
  if (
    /^captain\/teams\/:[^/]+(?:\/(?:profile|applications\/:[^/]+|members\/:[^/]+|lineup-plans(?:\/:[^/]+\/(?:revisions|default|confirm))?))?$/.test(
      path,
    ) ||
    /^roster\/tournaments\/:[^/]+\/teams\/:[^/]+(?:\/commands)?$/.test(path) ||
    /^teams\/:[^/]+\/(?:relationship|join-applications)$/.test(path)
  )
    return ['teamManagement']
  if (/^matches\/:[^/]+\/report(?:\/history)?$/.test(path)) return ['matchReporting']
  if (/^matches\/:[^/]+\/technical-statistics$/.test(path)) return ['matchReporting']
  if (/^messages\/(?:directory|conversations(?:\/:[^/]+(?:\/read)?)?|direct\/:[^/]+)$/.test(path))
    return ['directMessages']
  const admin =
    /^admin\/(?:center\/(?:overview|users(?:\/:[^/]+\/(?:membership|revoke-sessions))?|teams(?:\/:[^/]+)?|players(?:\/:[^/]+)?|audit|media|system|posts(?:\/:[^/]+)?|tournaments\/:[^/]+\/rule-versions)|identities|reports(?:\/:[^/]+)?|schedule-workbench|seasons|venues|tournaments(?:\/:[^/]+\/(?:rule-versions|teams|matches|team-registrations(?:\/:[^/]+)?))?|schedule-plans(?:\/:[^/]+\/(?:validate|publish))?)$/.test(
      path,
    )
  if (admin)
    return path.startsWith('admin/center/posts')
      ? ['administration', 'community']
      : ['administration']
  return []
}

@Injectable()
export class ProductModuleGuard implements CanActivate {
  constructor(@Inject(ProductConfigService) private readonly configuration: ProductConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithId>()
    const route: unknown = request.route?.path
    // Never infer authorization from an unmatched, user-provided URL.
    if (typeof route !== 'string') return true
    const required = modulesForRoute(route)
    const config = this.configuration.getConfiguration()
    const unavailable = required.find((id) => !config.modules[id].enabled)
    if (unavailable)
      throw new ApiHttpException(HttpStatus.FORBIDDEN, {
        code: ERROR_CODES.FORBIDDEN,
        message: UNAVAILABLE_FEATURE_REASON,
        details: { module: unavailable },
      })
    return true
  }
}
