/**
 * Shared plumbing for seed scripts: a privileged (RLS-bypassing) Drizzle handle
 * and a Supabase Auth admin helper (via built-in fetch — no SDK dependency).
 *
 * Each seed module exports `name`, `description`, and `seed(ctx)`. The runner
 * (`run.ts`) wires the context and invokes the chosen seed.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';

export type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

export interface SeedContext {
  db: SeedDb;
  schema: typeof schema;
  /** Create (or fetch) a Supabase Auth user; returns its uid. Idempotent. */
  ensureAuthUser(email: string, name: string, password: string): Promise<string>;
  log: (msg: string) => void;
}

export interface SeedModule {
  name: string;
  description: string;
  seed: (ctx: SeedContext) => Promise<void>;
}

export interface SeedEnv {
  databaseUrl: string;
  supabaseUrl?: string;
  serviceKey?: string;
}

/** Builds the context + returns a teardown to close the pool. */
export function createSeedContext(env: SeedEnv): { ctx: SeedContext; close: () => Promise<void> } {
  const client = postgres(env.databaseUrl, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  const ensureAuthUser: SeedContext['ensureAuthUser'] = async (email, name, password) => {
    if (!env.supabaseUrl || !env.serviceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to create logins for this seed.',
      );
    }
    const base = `${env.supabaseUrl}/auth/v1`;
    const headers = {
      apikey: env.serviceKey,
      Authorization: `Bearer ${env.serviceKey}`,
      'Content-Type': 'application/json',
    };

    const create = await fetch(`${base}/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
    });
    if (create.ok) {
      const body = (await create.json()) as { id: string };
      return body.id;
    }

    // Already exists → look it up. GoTrue's `?email=` filter is unreliable across
    // versions, so page through the admin user list and match by email.
    const target = email.toLowerCase();
    for (let page = 1; page <= 50; page++) {
      const list = await fetch(`${base}/admin/users?page=${page}&per_page=200`, { headers });
      if (!list.ok) {
        throw new Error(`Could not create or find auth user ${email}: ${await create.text()}`);
      }
      const found = (await list.json()) as { users?: { id: string; email: string }[] };
      const users = found.users ?? [];
      const match = users.find((u) => u.email?.toLowerCase() === target);
      if (match) return match.id;
      if (users.length < 200) break; // last page
    }
    throw new Error(`Auth user ${email} not found after conflict.`);
  };

  return {
    ctx: { db, schema, ensureAuthUser, log: (m) => console.log(m) },
    close: () => client.end(),
  };
}
