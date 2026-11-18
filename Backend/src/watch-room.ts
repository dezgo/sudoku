// Watching a crew-mate play (Nov 2026). One Durable Object per player: while
// they have a solo game on screen, their phone (the host) holds a WebSocket
// here. A crew-mate who taps "Watch" connects as a watcher and the host is
// asked; nothing is relayed until the host allows it. The host can stop it
// any time. Nothing is stored — it's a live relay only.
//
// host → room:    allow {id} · deny {id} · board {...} · stop · done
// watcher → room: react {e}
// room → host:    ask {id, name} · gone {id} · react {e, name}
// room → watcher: waiting · allowed · denied · board {...} · react {e, name} · ended {reason}

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

interface Who {
  role: 'host' | 'watcher';
  id: string;
  name: string;
  allowed: boolean;
}

const REACTIONS = ['👏', '😮', '💡', '🔥', '😂', '❤️'];

export class WatchRoom extends DurableObject<Env> {
  private sockets(role?: Who['role']): { ws: WebSocket; who: Who }[] {
    return this.ctx
      .getWebSockets()
      .map((ws) => ({ ws, who: ws.deserializeAttachment() as Who | null }))
      .filter((s): s is { ws: WebSocket; who: Who } => !!s.who && (!role || s.who.role === role));
  }

  private send(ws: WebSocket, msg: unknown): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closing */
    }
  }

  async fetch(req: Request): Promise<Response> {
    const who: Who = {
      role: req.headers.get('x-role') === 'host' ? 'host' : 'watcher',
      id: req.headers.get('x-user-id')!,
      name: req.headers.get('x-user-name') || 'Someone',
      allowed: false,
    };
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    if (who.role === 'host') {
      // A newer host connection (e.g. after a reconnect) replaces the old one.
      for (const h of this.sockets('host')) h.ws.close(1000, 'replaced');
      server.serializeAttachment(who);
      this.ctx.acceptWebSocket(server);
      // Watchers who were waiting get asked again.
      for (const w of this.sockets('watcher')) if (!w.who.allowed) this.send(server, { t: 'ask', id: w.who.id, name: w.who.name });
    } else {
      // One watching session per person.
      for (const w of this.sockets('watcher')) if (w.who.id === who.id) w.ws.close(1000, 'replaced');
      server.serializeAttachment(who);
      this.ctx.acceptWebSocket(server);
      const host = this.sockets('host')[0];
      if (!host) {
        this.send(server, { t: 'ended', reason: 'not_playing' });
        server.close(1000, 'not_playing');
      } else {
        this.send(server, { t: 'waiting' });
        this.send(host.ws, { t: 'ask', id: who.id, name: who.name });
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let msg: { t?: string; id?: string; e?: string };
    try {
      msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    } catch {
      return;
    }
    const me = ws.deserializeAttachment() as Who;

    if (me.role === 'host') {
      const watchers = this.sockets('watcher');
      if (msg.t === 'allow' || msg.t === 'deny') {
        const w = watchers.find((x) => x.who.id === msg.id);
        if (!w) return;
        if (msg.t === 'allow') {
          w.ws.serializeAttachment({ ...w.who, allowed: true });
          this.send(w.ws, { t: 'allowed' });
        } else {
          this.send(w.ws, { t: 'denied' });
          w.ws.close(1000, 'denied');
        }
      } else if (msg.t === 'board') {
        const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
        for (const w of watchers) if (w.who.allowed) w.ws.send(text);
      } else if (msg.t === 'stop' || msg.t === 'done') {
        for (const w of watchers) {
          this.send(w.ws, { t: 'ended', reason: msg.t === 'done' ? 'done' : 'stopped' });
          w.ws.close(1000, msg.t);
        }
      }
      return;
    }

    // Watcher: only reactions, and only once allowed.
    if (msg.t === 'react' && me.allowed && msg.e && REACTIONS.includes(msg.e)) {
      for (const s of this.sockets()) if (s.ws !== ws) this.send(s.ws, { t: 'react', e: msg.e, name: me.name });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const me = ws.deserializeAttachment() as Who | null;
    if (!me) return;
    if (me.role === 'host') {
      // Host went away (closed the game, lost signal): end everyone's watching —
      // unless a fresh host connection already took over.
      if (this.sockets('host').some((h) => h.ws !== ws)) return;
      for (const w of this.sockets('watcher')) {
        this.send(w.ws, { t: 'ended', reason: 'left' });
        w.ws.close(1000, 'left');
      }
    } else {
      const host = this.sockets('host')[0];
      if (host) this.send(host.ws, { t: 'gone', id: me.id });
    }
  }
}
