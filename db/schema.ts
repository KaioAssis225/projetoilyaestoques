import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const inventory = sqliteTable("inventory", {
  code: text("code").primaryKey(),
  description: text("description").notNull(),
  finish: text("finish").notNull(),
  china: integer("china").notNull().default(0),
  transit: integer("transit").notNull().default(0),
  port: integer("port").notNull().default(0),
  gh: integer("gh").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  chinaQuantity: integer("china_quantity").notNull(),
  transitQuantity: integer("transit_quantity").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const shipments = sqliteTable("shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseOrderId: integer("purchase_order_id"),
  code: text("code").notNull(),
  quantity: integer("quantity").notNull(),
  source: text("source").notNull(),
  stage: text("stage").notNull(),
  dueDate: text("due_date").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const logisticsEvents = sqliteTable("logistics_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  code: text("code").notNull(),
  quantity: integer("quantity").notNull(),
  previousQuantity: integer("previous_quantity"),
  newQuantity: integer("new_quantity"),
  invoiceNumber: text("invoice_number"),
  orderNumber: text("order_number"),
  street: text("street"),
  column: text("column"),
  level: text("level"),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const allocations = sqliteTable("allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  street: text("street").notNull(),
  column: text("column").notNull(),
  level: text("level").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const allocationTasks = sqliteTable("allocation_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shipmentId: integer("shipment_id"),
  code: text("code").notNull(),
  quantity: integer("quantity").notNull(),
  allocatedQuantity: integer("allocated_quantity").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
