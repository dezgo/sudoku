// One live co-op game (SPEC §18). Every player's phone holds a WebSocket to
// this Durable Object; placed numbers go through it and are broadcast to the
// others. Pencil marks never come here — they're private to each phone.
// Uses the hibernation API, so an idle game costs nothing; state is kept in
// storage and reloaded after a wake.

import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

interface Room {
  name: string;
  givens: number[]; // 81, 0 = blank
  solution: number[];
  values: number[]; // current board: givens + placed numbers (right or wrong)
  by: (string | null)[]; // who placed each number
  mistakes: number;
  startedAt: number | null; // clock starts when a 2nd player arrives or the first number goes in
  completedAt: number | null;
  players: Record<string, string>; // user id → display name
}

interface Who {
  id: string;
  name: string;
  sel: number | null;
}

type ClientMsg = { t: 'place'; i: number; v: number } | { t: 'clear'; i: number } | { t: 'sel'; i: number | null };

export class CoopRoom extends DurableObject<Env> {
  private room: Room | null = null;

  private async load(name?: string): Promise<Room | null> {
    if (this.room) return this.room;
    this.room = (await this.ctx.storage.get<Room>('room')) ?? null;
    if (this.room || !name) return this.room;
    const row = await this.env.DB.prepare('SELECT givens, solution FROM coop_games WHERE name = ?')
      .bind(name)
      .first<{ givens: string; solution: string }>();
    if (!row) return null;
    const givens = (JSON.parse(row.givens) as number[][]).flat();
    this.room = {
      name,
      givens,
      solution: (JSON.parse(row.solution) as number[][]).flat(),
      values: [...givens],
      by: givens.map(() => null),
      mistakes: 0,
      startedAt: null,
      completedAt: null,
      players: {},
    };
    await this.save();
    return this.room;
  }

  private save(): Promise<void> {
    return this.ctx.storage.put('room', this.room);
  }

  private connected(except?: WebSocket): Who[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== except)
      .map((ws) => ws.deserializeAttachment() as Who);
  }

  private broadcast(msg: unknown, except?: WebSocket): void {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        /* socket already closing */
      }
    }
  }

  private elapsed(r: Room): number {
    if (!r.startedAt) return 0;
    return Math.floor(((r.completedAt ?? Date.now()) - r.startedAt) / 1000);
  }

  /** Who's here and where they're looking. `except`: a socket that's closing. */
  private presence(r: Room, except?: WebSocket) {
    const who = this.connected(except);
    return {
      t: 'presence',
      players: r.players,
      online: [...new Set(who.map((w) => w.id))],
      sels: Object.fromEntries(who.map((w) => [w.id, w.sel])),
      started: r.startedAt !== null,
      elapsed: this.elapsed(r),
    };
  }

  async fetch(req: Request): Promise<Response> {
    const name = req.headers.get('x-coop-name')!;
    const who: Who = { id: req.headers.get('x-user-id')!, name: req.headers.get('x-user-name') || 'Player', sel: null };
    const r = await this.load(name);
    if (!r) return new Response('not found', { status: 404 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(who);

    r.players[who.id] = who.name;
    if (!r.startedAt && !r.completedAt && new Set(this.connected().map((w) => w.id)).size >= 2) r.startedAt = Date.now();
    await this.save();

    server.send(JSON.stringify({ t: 'state', values: r.values, by: r.by, mistakes: r.mistakes, completed: r.completedAt !== null }));
    this.broadcast(this.presence(r));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const who = ws.deserializeAttachment() as Who;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    } catch {
      return;
    }
    const r = await this.load();
    if (!r) return;

    if (msg.t === 'sel') {
      who.sel = Number.isInteger(msg.i) && msg.i! >= 0 && msg.i! < 81 ? msg.i : null;
      ws.serializeAttachment(who);
      this.broadcast({ t: 'sel', id: who.id, i: who.sel }, ws);
      return;
    }

    const i = msg.i;
    if (!Number.isInteger(i) || i < 0 || i >= 81) return;
    // A move that can't apply (finished game, a starting number, a square
    // someone has already got right) still answers the sender with the real
    // square, so a phone that raced its partner snaps back into line.
    const refuse = () => ws.send(JSON.stringify({ t: 'cell', i, v: r.values[i], by: r.by[i], mistakes: r.mistakes }));
    if (r.completedAt || r.givens[i] !== 0 || r.values[i] === r.solution[i]) return refuse();

    if (msg.t === 'place') {
      const v = msg.v;
      if (!Number.isInteger(v) || v < 1 || v > 9) return refuse();
      if (r.values[i] === v) return;
      r.values[i] = v;
      r.by[i] = who.id;
      if (v !== r.solution[i]) r.mistakes++;
      if (!r.startedAt) r.startedAt = Date.now();
    } else if (msg.t === 'clear') {
      if (r.values[i] === 0) return;
      r.values[i] = 0;
      r.by[i] = null;
    } else return;

    const done = r.values.every((v, k) => v === r.solution[k]);
    if (done) r.completedAt = Date.now();
    await this.save();
    this.broadcast({ t: 'cell', i, v: r.values[i], by: r.by[i], mistakes: r.mistakes });
    if (done) {
      this.broadcast({ t: 'done', elapsed: this.elapsed(r), mistakes: r.mistakes });
      await this.env.DB.prepare('UPDATE coop_games SET completed_at = ?, elapsed_seconds = ?, mistakes = ? WHERE name = ?')
        .bind(r.completedAt, this.elapsed(r), r.mistakes, r.name)
        .run();
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.left(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.left(ws);
  }

  private async left(ws: WebSocket): Promise<void> {
    const r = await this.load();
    if (r) this.broadcast(this.presence(r, ws), ws);
  }
}
