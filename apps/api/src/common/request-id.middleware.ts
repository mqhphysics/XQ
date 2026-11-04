import { randomUUID } from 'node:crypto'

import type { RequestHandler } from 'express'

import type { RequestWithId } from './request-context'

const REQUEST_ID_HEADER = 'x-request-id'
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const requestWithId = request as RequestWithId
  const incomingRequestId = request.header(REQUEST_ID_HEADER)
  const requestId =
    incomingRequestId !== undefined && SAFE_REQUEST_ID.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID()

  requestWithId.requestId = requestId
  response.setHeader(REQUEST_ID_HEADER, requestId)
  next()
}
