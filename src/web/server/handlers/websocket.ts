import { WebSocket } from 'ws'
import type { PubSub } from '../pubsub.ts'
import { manager } from '../../../plugin/pty/manager'
import {
  type WSMessageServerSessionList,
  type WSMessageClientSubscribeSession,
  type WSMessageClientUnsubscribeSession,
  type WSMessageClient,
  type WSMessageClientSpawnSession,
  type WSMessageClientInput,
  type WSMessageClientReadRaw,
  type WSMessageServerReadRawResponse,
  type WSMessageServerSubscribedSession,
  CustomError,
  type WSMessageServerUnsubscribedSession,
} from '../../shared/types'

class WebSocketHandler {
  constructor(private pubsub: PubSub) {}

  private sendSessionList(ws: WebSocket): void {
    const sessions = manager.list()
    const msg: WSMessageServerSessionList = { type: 'session_list', sessions }
    ws.send(JSON.stringify(msg))
  }

  private handleSubscribe(ws: WebSocket, msg: WSMessageClientSubscribeSession): void {
    const session = manager.get(msg.sessionId)
    if (!session) {
      ws.send(JSON.stringify({ type: 'error', error: new CustomError(`Session ${msg.sessionId} not found`) }))
      return
    }
    this.pubsub.subscribe(`session:${msg.sessionId}`, ws)
    ws.send(JSON.stringify({ type: 'subscribed', sessionId: msg.sessionId } as WSMessageServerSubscribedSession))
  }

  private handleUnsubscribe(ws: WebSocket, msg: WSMessageClientUnsubscribeSession): void {
    this.pubsub.unsubscribe(`session:${msg.sessionId}`, ws)
    ws.send(JSON.stringify({ type: 'unsubscribed', sessionId: msg.sessionId } as WSMessageServerUnsubscribedSession))
  }

  private handleUnknown(ws: WebSocket, msg: WSMessageClient): void {
    ws.send(JSON.stringify({ type: 'error', error: new CustomError(`Unknown message type ${msg.type}`) }))
  }

  handleMessage(ws: WebSocket, data: unknown): void {
    const raw = Buffer.isBuffer(data) ? data.toString() : typeof data === 'string' ? data : String(data)
    if (data instanceof ArrayBuffer) {
      ws.send(JSON.stringify({ type: 'error', error: new CustomError('Binary messages not supported') }))
      return
    }
    try {
      const msg = JSON.parse(raw) as WSMessageClient
      switch (msg.type) {
        case 'subscribe': { this.handleSubscribe(ws, msg as WSMessageClientSubscribeSession); break }
        case 'unsubscribe': { this.handleUnsubscribe(ws, msg as WSMessageClientUnsubscribeSession); break }
        case 'session_list': { this.sendSessionList(ws); break }
        case 'spawn': { this.handleSpawn(ws, msg as WSMessageClientSpawnSession); break }
        case 'input': { manager.write((msg as WSMessageClientInput).sessionId, (msg as WSMessageClientInput).data); break }
        case 'readRaw': { this.handleReadRaw(ws, msg as WSMessageClientReadRaw); break }
        default: { this.handleUnknown(ws, msg); break }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', error: new CustomError(String(err)) }))
    }
  }

  private handleSpawn(ws: WebSocket, msg: WSMessageClientSpawnSession): void {
    const info = manager.spawn(msg)
    if (msg.subscribe) this.handleSubscribe(ws, { type: 'subscribe', sessionId: info.id })
  }

  private handleReadRaw(ws: WebSocket, msg: WSMessageClientReadRaw): void {
    const raw = manager.getRawBuffer(msg.sessionId)
    if (!raw) {
      ws.send(JSON.stringify({ type: 'error', error: new CustomError(`Session ${msg.sessionId} not found`) }))
      return
    }
    ws.send(JSON.stringify({ type: 'readRawResponse', sessionId: msg.sessionId, rawData: raw.raw } as WSMessageServerReadRawResponse))
  }
}

export function handleWebSocketMessage(ws: WebSocket, data: unknown, pubsub: PubSub): void {
  new WebSocketHandler(pubsub).handleMessage(ws, data)
}
