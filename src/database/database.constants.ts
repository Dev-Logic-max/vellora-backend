/** DI token for the Drizzle database instance (schema-aware). */
export const DRIZZLE = Symbol('DRIZZLE_ORM');

/** DI token for the raw postgres.js client (used for shutdown + health pings). */
export const PG_CONNECTION = Symbol('PG_CONNECTION');
