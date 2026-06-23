import { WebSocket } from 'ws'

/** Simple pub/sub for WebSocket topic-based broadcasting */
export class PubSub {
  private topics = new Map<string, Set<WebSocket>>()

  subscribe(topic: string, ws: WebSocket): void {
    let subs = this.topics.get(topic)
    if (!subs) {
      subs = new Set()
      this.topics.set(topic, subs)
    }
    subs.add(ws)
  }

  unsubscribe(topic: string, ws: WebSocket): void {
    this.topics.get(topic)?.delete(ws)
  }

  unsubscribeAll(ws: WebSocket): void {
    for (const subs of this.topics.values()) {
      subs.delete(ws)
    }
  }

  publish(topic: string, data: string): void {
    this.topics.get(topic)?.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    })
  }

  get connectionCount(): number {
    const all = new Set<WebSocket>()
    for (const subs of this.topics.values()) {
      subs.forEach((ws) => all.add(ws))
    }
    return all.size
  }
}
