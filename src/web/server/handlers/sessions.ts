import stripAnsi from 'strip-ansi'
import { manager } from '../../../plugin/pty/manager.ts'
import { JsonResponse, ErrorResponse } from './responses.ts'

export function getSessions() {
  return new JsonResponse(manager.list())
}

export async function createSession(req: Request) {
  let body: { command: string; args?: string[]; description?: string; workdir?: string; timeoutSeconds?: number }
  try { body = await req.json() as typeof body } catch { return new ErrorResponse('Invalid JSON', 400) }
  if (!body.command?.trim()) return new ErrorResponse('Command is required', 400)
  try {
    return new JsonResponse(manager.spawn({
      command: body.command, args: body.args || [], title: body.description,
      description: body.description, workdir: body.workdir,
      timeoutSeconds: body.timeoutSeconds, parentSessionId: 'web-api',
    }))
  } catch (err) {
    return new ErrorResponse(err instanceof Error ? err.message : 'Failed to create session', 400)
  }
}

export function clearSessions() {
  manager.clearAllSessions()
  return new JsonResponse({ success: true })
}

export function getSession(id: string) {
  const s = manager.get(id)
  return s ? new JsonResponse(s) : new ErrorResponse('Session not found', 404)
}

export async function sendInput(req: Request, id: string): Promise<Response> {
  try {
    const body = await req.json() as { data: string }
    if (!body.data) return new ErrorResponse('Data field required', 400)
    return manager.write(id, body.data)
      ? new JsonResponse({ success: true })
      : new ErrorResponse('Failed to write', 400)
  } catch { return new ErrorResponse('Invalid JSON', 400) }
}

export function cleanupSession(id: string) {
  return manager.kill(id, true)
    ? new JsonResponse({ success: true })
    : new ErrorResponse('Failed to kill', 400)
}

export function killSession(id: string) {
  return manager.kill(id)
    ? new JsonResponse({ success: true })
    : new ErrorResponse('Failed to kill', 400)
}

export function getRawBuffer(id: string) {
  const buf = manager.getRawBuffer(id)
  return buf ? new JsonResponse(buf) : new ErrorResponse('Session not found', 404)
}

export function getPlainBuffer(id: string) {
  const buf = manager.getRawBuffer(id)
  if (!buf) return new ErrorResponse('Session not found', 404)
  const plain = stripAnsi(buf.raw)
  return new JsonResponse({ plain, byteLength: new TextEncoder().encode(plain).length })
}
