import type { PTYServer } from './server.ts'
import {
  registerRawOutputCallback,
  registerSessionUpdateCallback,
  removeRawOutputCallback,
  removeSessionUpdateCallback,
} from '../../plugin/pty/manager'
import type { PTYSessionInfo } from '../../plugin/pty/types'
import type { WSMessageServerSessionUpdate, WSMessageServerRawData } from '../shared/types'

export class CallbackManager implements Disposable {
  constructor(private server: PTYServer) {
    registerSessionUpdateCallback(this.onSessionUpdate)
    registerRawOutputCallback(this.onRawOutput)
  }

  private onSessionUpdate = (session: PTYSessionInfo): void => {
    const msg: WSMessageServerSessionUpdate = { type: 'session_update', session }
    this.server.pubsub.publish('sessions:update', JSON.stringify(msg))
  }

  private onRawOutput = (session: PTYSessionInfo, rawData: string): void => {
    const msg: WSMessageServerRawData = { type: 'raw_data', session, rawData }
    this.server.pubsub.publish(`session:${session.id}`, JSON.stringify(msg))
  }

  [Symbol.dispose]() {
    removeSessionUpdateCallback(this.onSessionUpdate)
    removeRawOutputCallback(this.onRawOutput)
  }
}
