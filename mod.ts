import Emitter from 'https://raw.githubusercontent.com/Mango/emitter/0.0.7/src/index.js';
import { ServerRequest, serve } from 'https://deno.land/x/http/server.ts';
import { Status } from 'https://deno.land/x/http/http_status.ts';
import {
  acceptWebSocket,
  isWebSocketCloseEvent,
  WebSocketCloseEvent,
  WebSocket
} from 'https://deno.land/x/ws/mod.ts';

export interface CQHttpOptions {
  access_token?: string;
  ws_reverse_url?: string;
  ws_reverse_api_url?: string;
  ws_reverse_event_url?: string;
}

class AbortException extends Error {}
export class NetworkError extends Error {}
export class ApiNotAvailable extends Error {}
export class ApiError extends Error {}
export class ActionFailed extends ApiError {
  retcode: number;
  constructor(retcode: number, message?: string) {
    super(message);
    this.retcode = retcode;
  }
}

class CQEventEmitter extends Emitter {

  emit(event: string, ...args) {
    const s = event.split('.');
    if (s.length === 0) return;
    for (let i = s.length; i > 0; i--) {
      super.emit(s.slice(0, i).join('.'), ...args);
    }
  }

}

function *SequenceGenerator() {
  let i = 0;
  while (true) {
    yield (i++) + '';
    if (i >= Number.MAX_SAFE_INTEGER) i = 0;
  }
}


class WSReverseAPIResultStore {

  private emitter = new Emitter();
  private readonly timeout = 60 * 1000;

  add(result: any) {
    this.emitter.emit(result['echo'], result);
  }

  async fetch(seq: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitter.off(seq, resolve);
        reject(new NetworkError('WebSocket API call timeout'));
      }, this.timeout);
      this.emitter.once(seq, res => {
        clearTimeout(timer);
        resolve(res);
      });
    });
  }

}

export class CQHttp extends CQEventEmitter {

  [key: string]: any;
  private readonly config: CQHttpOptions = {
    ws_reverse_url: '/ws/',
    ws_reverse_api_url: '/ws/api/',
    ws_reverse_event_url: '/ws/event/',
  };

  private connectedWSReverseAPIClients = {};
  private resultStore = new WSReverseAPIResultStore();
  private sequenceGenerator = SequenceGenerator();

  constructor(options?: CQHttpOptions) {
    super();

    if (options) {
      this.config = Object.assign({}, options, this.config);
    }

    return new Proxy(this, {
      get: (target, property) => {
        if (property in target) {
          return Reflect.get(target, property);
        } else if (typeof property === 'string') {
          return (options?) => this.callAction(property, options);
        }
        return undefined;
      }
    });
  }

  async callAction(action: string, params?: any): Promise<any> {
    if (params === undefined) params = {};
    let api;
    if (params.self_id) {
      api = this.connectedWSReverseAPIClients[params.self_id + ''];
    } else if (Object.values(this.connectedWSReverseAPIClients).length === 1) {
      api = Object.values(this.connectedWSReverseAPIClients)[0];
    }
    if (!api) throw new ApiNotAvailable();

    const echo = this.sequenceGenerator.next().value;
    await api.send(JSON.stringify({
      action,
      params,
      echo,
    }));

    return this.handleAPIResult(await this.resultStore.fetch(echo));
  }

  private handleAPIResult(result?: any): any {
    if (typeof result === 'object' && result.status === 'failed') {
      throw new ActionFailed(result.retcode);
    } else {
      return result.data;
    }
  }

  private validateWSReverseAccessToken(req: ServerRequest) {
    if (!this.config.access_token) return;
    const auth = req.headers.get('Authorization');
    if (!auth) {
      req.respond({
        status: Status.Unauthorized,
      });
      throw new AbortException();
    }
    const tokenGiven = auth.trim().slice('Token '.length);
    if (!tokenGiven) {
      req.respond({
        status: Status.Unauthorized,
      });
      throw new AbortException();
    }
    if (tokenGiven !== this.config.access_token) {
      req.respond({
        status: Status.Forbidden,
      });
      throw new AbortException();
    }
  }

  async listen(host: string, port: number) {
    for await (const req of serve(`${host}:${port}`)) {
      if (req.url === this.config.ws_reverse_url) {
        this.handleWSReverse(req);
      } else if (req.url === this.config.ws_reverse_api_url) {
        this.handleWSReverseAPI(req);
      } else if (req.url === this.config.ws_reverse_event_url) {
        this.handleWSReverseEvent(req);
      }
    }
  }

  private async handleWSReverse(req: ServerRequest) {
    const role = (req.headers.get('X-Client-Role') || '').toLowerCase();
    switch (role) {
      case 'event':
        await this.handleWSReverseEvent(req);
        break;
      case 'api':
        await this.handleWSReverseAPI(req);
        break;
      case 'universal':
        await this.handleWSReverseUniversal(req);
    }
  }

  private async handleWSReverseEvent(req: ServerRequest) {
    try { this.validateWSReverseAccessToken(req); }
    catch { return; }

    const sock = await acceptWebSocket(req);
    this.onWSReverseConnect('event', req);
    for await (const ev of sock.receive()) {
      if (typeof ev === 'string') {
        let m;
        try {
          m = JSON.parse(ev)
        } catch {
          continue;
        }
        this.handleEventPayloadWithResponse(m);
      } else if (isWebSocketCloseEvent(ev)) {
        this.onWSReverseClose('event', ev, req);
      }
    }
  }

  private async handleWSReverseAPI(req: ServerRequest) {
    try { this.validateWSReverseAccessToken(req); }
    catch { return; }

    const sock = await this.addWSReverseAPIConnection(req);
    this.onWSReverseConnect('api', req);
    for await (const ev of sock.receive()) {
      if (typeof ev === 'string') {
        let m;
        try {
          m = JSON.parse(ev)
        } catch {
          continue;
        }
        this.resultStore.add(m);
      } else if (isWebSocketCloseEvent(ev)) {
        this.onWSReverseClose('api', ev, req);
        this.removeWSReverseAPIConnection(req);
      }
    }
  }


  private async handleWSReverseUniversal(req: ServerRequest) {
    try { this.validateWSReverseAccessToken(req); }
    catch { return; }

    const sock = await this.addWSReverseAPIConnection(req);
    this.onWSReverseConnect('universal', req);
    for await (const ev of sock.receive()) {
      if (typeof ev === 'string') {
        let m;
        try {
          m = JSON.parse(ev)
        } catch {
          continue;
        }
        if (typeof m === 'object' && m.post_type) {
          this.handleEventPayloadWithResponse(m);
        } else {
          this.resultStore.add(m);
        }
      } else if (isWebSocketCloseEvent(ev)) {
        this.onWSReverseClose('universal', ev, req);
        this.removeWSReverseAPIConnection(req);
      }
    }
  }

  private onWSReverseConnect(role: string, req: ServerRequest) {
    this.emit('socket.connect', {
      role,
      self_id: req.headers.get('X-Self-ID') || '*',
    });
  }

  private onWSReverseClose(role: string, ev: WebSocketCloseEvent, req: ServerRequest) {
    const { code, reason } = ev;
    this.emit('socket.close', {
      role,
      self_id: req.headers.get('X-Self-ID') || '*',
      code,
      reason,
    });
  }

  private async addWSReverseAPIConnection(req: ServerRequest): Promise<WebSocket> {
    const sock = await acceptWebSocket(req);
    const self_id = req.headers.get('X-Self-ID') || '*';
    this.connectedWSReverseAPIClients[self_id] = sock;
    return sock;
  }

  private removeWSReverseAPIConnection(req: ServerRequest) {
    const self_id = req.headers.get('X-Self-ID') || '*';
    delete this.connectedWSReverseAPIClients[self_id];
  }

  private async handleQuickOperation(payload: any, response: any) {
    if (response) {
      try {
        await this.callAction('.handle_quick_operation_async', {
          context: payload,
          operation: response,
        });
      } catch { }
    }
  }

  private handleEventPayloadWithResponse(payload: any) {
    const postType = payload.post_type;
    const detailedType = payload[`${postType}_type`];
    if (!postType || !detailedType) return;

    let event = `${postType}.${detailedType}`;
    if (payload.sub_type) {
      event = `${event}.${payload.sub_type}`;
    }
    this.emit(event, payload, async response => await this.handleQuickOperation(payload, response));
  }

}

export default CQHttp;
