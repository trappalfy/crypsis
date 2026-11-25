// Public onchain data only (brief §3). No user tables, no IPs, no private data.
import { bigint, boolean, index, integer, numeric, pgEnum, pgTable, primaryKey, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const ringEventKind = pgEnum("ring_event_kind", ["deposit", "withdraw", "interface_created"]);

export const coins = pgTable("coins", {
  mint: text("mint").primaryKey(),
  symbol: text("symbol"),
  name: text("name"),
  imageUri: text("image_uri"),
  tokenProgram: text("token_program").notNull(),
  decimals: smallint("decimals").notNull(),
  vault: text("vault").notNull(),
  isPump: boolean("is_pump").notNull().default(false),
  launchedViaCrypsis: boolean("launched_via_crypsis").notNull().default(false),
  creator: text("creator"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  ringReadyAt: timestamp("ring_ready_at", { withTimezone: true }),
  graduated: boolean("graduated").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("coins_is_pump_idx").on(t.isPump)]);

export const ringEvents = pgTable("ring_events", {
  signature: text("signature").notNull(),
  ixIndex: integer("ix_index").notNull(),
  slot: bigint("slot", { mode: "number" }).notNull(),
  blockTime: timestamp("block_time", { withTimezone: true }),
  mint: text("mint").notNull(),
  kind: ringEventKind("kind").notNull(),
  /** raw token units */
  amount: numeric("amount", { precision: 40, scale: 0 }),
  fromAddr: text("from_addr"),
  toAddr: text("to_addr"),
}, (t) => [
  primaryKey({ columns: [t.signature, t.ixIndex] }),
  index("ring_events_mint_time_idx").on(t.mint, t.blockTime),
  index("ring_events_time_idx").on(t.blockTime),
]);

export const snapshots = pgTable("snapshots", {
  mint: text("mint").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  vaultAmount: numeric("vault_amount", { precision: 40, scale: 0 }).notNull(),
  totalSupply: numeric("total_supply", { precision: 40, scale: 0 }).notNull(),
  /** supply minus bonding curve (and pool after migration) balances; null when unknown */
  circulating: numeric("circulating", { precision: 40, scale: 0 }),
  shareBps: integer("share_bps").notNull(),
}, (t) => [primaryKey({ columns: [t.mint, t.ts] }), index("snapshots_ts_idx").on(t.ts)]);

export const launches = pgTable("launches", {
  mint: text("mint").primaryKey(),
  creator: text("creator").notNull(),
  createSig: text("create_sig").notNull(),
  interfaceSig: text("interface_sig"),
  shieldSig: text("shield_sig"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Cursors for backfill / webhook bookkeeping. */
export const indexerState = pgTable("indexer_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Coin = typeof coins.$inferSelect;
export type NewCoin = typeof coins.$inferInsert;
export type RingEvent = typeof ringEvents.$inferSelect;
export type NewRingEvent = typeof ringEvents.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
