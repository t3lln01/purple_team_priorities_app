import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const threatModelSnapshotsTable = pgTable("threat_model_snapshots", {
  quarter: text("quarter").primaryKey(),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }),
  seededFrom: text("seeded_from"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertThreatModelSnapshotSchema = createInsertSchema(threatModelSnapshotsTable).omit({
  updatedAt: true,
});

export type InsertThreatModelSnapshot = z.infer<typeof insertThreatModelSnapshotSchema>;
export type ThreatModelSnapshot = typeof threatModelSnapshotsTable.$inferSelect;