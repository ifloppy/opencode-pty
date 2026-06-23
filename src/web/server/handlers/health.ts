import { manager } from '../../../plugin/pty/manager.ts'
import { JsonResponse } from './responses.ts'
import type { HealthResponse } from '../../shared/types.ts'
import type { PTYServer } from '../server.ts'

export function handleHealth(server: PTYServer) {
  const sessions = manager.list()
  const active = sessions.filter((s) => s.status === 'running').length
  const health: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sessions: { total: sessions.length, active },
    websocket: { connections: server.pubsub.connectionCount },
    memory: process.memoryUsage
      ? { rss: process.memoryUsage().rss, heapUsed: process.memoryUsage().heapUsed, heapTotal: process.memoryUsage().heapTotal }
      : undefined,
    responseTime: 0,
  }
  return new JsonResponse(health)
}
