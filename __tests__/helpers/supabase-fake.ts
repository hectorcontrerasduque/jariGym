import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Programmable in-memory double of the Supabase JS client for unit tests.
 *
 * - `client.from(table)` returns a chainable, thenable query builder that records
 *   every call; awaiting it resolves the next queued reply for `(table, op)`.
 * - `op` is the first of insert/update/delete/upsert/select called on the builder,
 *   so `insert(...).select().single()` counts as an "insert".
 * - Replies are FIFO per `(table, op)` (or per rpc name). Unqueued → `{ data: null, error: null }`.
 */

export type FakeOp = "select" | "insert" | "update" | "delete" | "upsert";

export interface FakeReply {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export interface FakeCall {
  kind: "from" | "rpc";
  table: string;
  op: FakeOp | "rpc";
  payload?: unknown;
  /** Filter / modifier calls in order, e.g. ["eq", "status", "pendiente"]. */
  filters: unknown[][];
}

const OPS: FakeOp[] = ["select", "insert", "update", "delete", "upsert"];
const MODIFIERS = [
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "not", "or",
  "match", "contains", "filter", "order", "limit", "range", "single", "maybeSingle",
] as const;

export function createSupabaseFake() {
  const queues = new Map<string, FakeReply[]>();
  const calls: FakeCall[] = [];
  let user: { id: string; email?: string } | null = null;

  const next = (key: string): FakeReply => {
    const q = queues.get(key);
    const reply = q && q.length > 0 ? q.shift()! : {};
    return { data: reply.data ?? null, error: reply.error ?? null, count: reply.count ?? null };
  };

  const enqueue = (key: string) => ({
    reply(r: FakeReply) {
      const q = queues.get(key) ?? [];
      q.push(r);
      queues.set(key, q);
      return this;
    },
  });

  function makeBuilder(table: string) {
    const call: FakeCall = { kind: "from", table, op: "select", filters: [] };
    let opSet = false;
    calls.push(call);

    let resolved: FakeReply | undefined;
    const builder: Record<string, unknown> = Object.fromEntries([
      ...OPS.map((op) => [
        op,
        (...args: unknown[]) => {
          if (!opSet) {
            call.op = op;
            opSet = true;
            if (op !== "select" && op !== "delete") call.payload = args[0];
          }
          call.filters.push([op, ...args]);
          return builder;
        },
      ]),
      ...MODIFIERS.map((m) => [
        m,
        (...args: unknown[]) => {
          call.filters.push([m, ...args]);
          return builder;
        },
      ]),
      [
        "then",
        (onFulfilled?: (v: FakeReply) => unknown, onRejected?: (e: unknown) => unknown) => {
          resolved ??= next(`${table}:${call.op}`);
          return Promise.resolve(resolved).then(onFulfilled, onRejected);
        },
      ],
    ]);
    return builder;
  }

  const client = {
    from: (table: string) => makeBuilder(table),
    rpc: (name: string, args?: unknown) => {
      calls.push({ kind: "rpc", table: name, op: "rpc", payload: args, filters: [] });
      return Promise.resolve(next(`rpc:${name}`));
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    calls,
    on: (table: string, op: FakeOp) => enqueue(`${table}:${op}`),
    onRpc: (name: string) => enqueue(`rpc:${name}`),
    setUser: (u: { id: string; email?: string } | null) => {
      user = u;
    },
    /** Calls on a table (optionally a given op), in order. */
    callsTo: (table: string, op?: FakeOp) =>
      calls.filter((c) => c.kind === "from" && c.table === table && (!op || c.op === op)),
  };
}

export type SupabaseFake = ReturnType<typeof createSupabaseFake>;
