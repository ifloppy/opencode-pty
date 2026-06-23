import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { PubSub } from './pubsub.ts'
import { routes } from '../shared/routes.ts'
import { CallbackManager } from './callback-manager.ts'
import { handleHealth } from './handlers/health.ts'
import {
  cleanupSession,
  clearSessions,
  createSession,
  getPlainBuffer,
  getRawBuffer,
  getSession,
  getSessions,
  killSession,
  sendInput,
} from './handlers/sessions.ts'
import { buildStaticRoutes, type StaticAsset } from './handlers/static.ts'
import { handleWebSocketMessage } from './handlers/websocket.ts'

function matchPath(pattern: string, actual: string): Record<string, string> | null {
  const pp = pattern.split('/')
  const ap = actual.split('/')
  if (pp.length !== ap.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    if (pp[i]!.startsWith(':')) {
      params[pp[i]!.slice(1)] = ap[i]!
    } else if (pp[i] !== ap[i]) {
      return null
    }
  }
  return params
}

type Handler = (req: http.IncomingMessage, params: Record<string, string>) => Response | Promise<Response>

export class PTYServer implements Disposable {
  server!: http.Server
  readonly pubsub = new PubSub()
  private wss!: WebSocketServer
  private staticRoutes: Record<string, StaticAsset> = {}
  private stack = new DisposableStack()
  private _url: URL | null = null

  private constructor() {}

  get url(): URL {
    return this._url!
  }

  [Symbol.dispose]() {
    this.stack.dispose()
  }

  static async createServer(): Promise<PTYServer> {
    const s = new PTYServer()
    s.staticRoutes = await buildStaticRoutes()
    s.server = http.createServer((req, res) => s.handleHttp(req, res))
    s.wss = new WebSocketServer({ noServer: true })
    s.wss.on('connection', (ws) => s.handleWsConnection(ws))

    s.server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
      if (url.pathname === routes.websocket.path) {
        s.wss.handleUpgrade(req, socket, head, (ws) => {
          s.wss.emit('connection', ws, req)
        })
      } else {
        socket.destroy()
      }
    })

    const port = process.env.PTY_WEB_PORT ? parseInt(process.env.PTY_WEB_PORT, 10) : 0
    s.server.listen(port, process.env.PTY_WEB_HOSTNAME ?? '127.0.0.1')
    const addr = s.server.address() as { port: number }
    s._url = new URL(`http://${process.env.PTY_WEB_HOSTNAME ?? '127.0.0.1'}:${addr.port}`)

    s.stack.use(s)
    s.stack.use(new CallbackManager(s))
    return s
  }

  private routes(): { path: string; methods: string[]; handler: Handler }[] {
    return [
      { path: routes.health.path, methods: ['GET'], handler: () => handleHealth(this) },
      { path: routes.sessions.path, methods: ['GET'], handler: () => getSessions() },
      { path: routes.sessions.path, methods: ['POST'], handler: async (req) => createSession(await this.readBody(req)) },
      { path: routes.sessions.path, methods: ['DELETE'], handler: () => clearSessions() },
      { path: routes.session.path, methods: ['GET'], handler: (_r, p) => getSession(p.id!) },
      { path: routes.session.path, methods: ['DELETE'], handler: (_r, p) => killSession(p.id!) },
      { path: routes.session.cleanup.path, methods: ['DELETE'], handler: (_r, p) => cleanupSession(p.id!) },
      { path: routes.session.input.path, methods: ['POST'], handler: async (req, p) => sendInput(await this.readBody(req), p.id!) },
      { path: routes.session.buffer.raw.path, methods: ['GET'], handler: (_r, p) => getRawBuffer(p.id!) },
      { path: routes.session.buffer.plain.path, methods: ['GET'], handler: (_r, p) => getPlainBuffer(p.id!) },
    ]
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const method = req.method ?? 'GET'
    const pathname = url.pathname

    for (const [pattern, asset] of Object.entries(this.staticRoutes)) {
      if (pathname === pattern && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': asset.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        })
        res.end(asset.bytes)
        return
      }
    }

    // Redirect / to /index.html (SPA catch-all)
    if (pathname === '/' && method === 'GET') {
      res.writeHead(302, { Location: '/index.html' })
      res.end()
      return
    }

    for (const route of this.routes()) {
      const params = matchPath(route.path, pathname)
      if (params && route.methods.includes(method)) {
        Promise.resolve()
          .then(() => route.handler(req, params))
          .then((resp) => {
            res.writeHead(resp.status, Object.fromEntries(resp.headers))
            resp.text().then((t) => res.end(t))
          })
          .catch((err) => {
            res.writeHead(500)
            res.end(JSON.stringify({ error: String(err) }))
          })
        return
      }
    }

    res.writeHead(404)
    res.end('Not Found')
  }

  private async readBody(req: http.IncomingMessage): Promise<Request> {
    const body = await new Promise<string>((resolve, reject) => {
      let d = ''
      req.on('data', (c) => (d += c))
      req.on('end', () => resolve(d))
      req.on('error', reject)
    })
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    return new Request(url.toString(), {
      method: req.method,
      headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string') as [string, string][],
      body: body || undefined,
    })
  }

  private handleWsConnection(ws: WebSocket): void {
    this.pubsub.subscribe('sessions:update', ws)
    ws.on('message', (data) => handleWebSocketMessage(ws, data, this.pubsub))
    ws.on('close', () => this.pubsub.unsubscribeAll(ws))
  }

  getWsUrl(): string {
    return `${this.url.origin.replace(/^http/, 'ws')}${routes.websocket.path}`
  }
}
