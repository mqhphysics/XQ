export type DependencyHealthStatus = 'ok' | 'down'

export interface DependencyHealth {
  status: DependencyHealthStatus
  latencyMs: number
}

export interface LivenessResponse {
  service: 'api'
  status: 'ok'
  version: string
  timestamp: string
  requestId: string
}

export interface ReadinessResponse extends LivenessResponse {
  database: DependencyHealth
}
