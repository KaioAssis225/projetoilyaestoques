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
  returns: integer("returns").notNull().default(0),
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

export const commitments = sqliteTable("commitments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  code: text("code").notNull(),
  quantity: integer("quantity").notNull(),
  note: text("note").notNull(),
  orderNumber: text("order_number"),
  loanItems: integer("loan_items", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const commitmentDocuments = sqliteTable("commitment_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(),
  reservationCode: text("reservation_code").unique(),
  orderNumber: text("order_number"),
  note: text("note").notNull().default(""),
  loanItems: integer("loan_items", { mode: "boolean" }).notNull().default(false),
  legacyCommitmentId: integer("legacy_commitment_id").unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const commitmentDocumentItems = sqliteTable("commitment_document_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  documentId: integer("document_id").notNull(),
  code: text("code").notNull(),
  quantity: integer("quantity").notNull(),
});

export const logisticsOrders = sqliteTable("logistics_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commitmentDocumentId: integer("commitment_document_id").notNull().unique(),
  orderNumber: text("order_number").notNull(),
  loanItems: integer("loan_items", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("awaiting_invoice"),
  invoiceNumber: text("invoice_number"),
  separatedAt: text("separated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  departedAt: text("departed_at"),
  returnedAt: text("returned_at"),
});

export const logisticsOrderItems = sqliteTable("logistics_order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  logisticsOrderId: integer("logistics_order_id").notNull(),
  code: text("code").notNull(),
  quantity: integer("quantity").notNull(),
});

export const logisticsOrderSources = sqliteTable("logistics_order_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  logisticsOrderItemId: integer("logistics_order_item_id").notNull(),
  allocationId: integer("allocation_id").notNull(),
  street: text("street").notNull(),
  column: text("column").notNull(),
  level: text("level").notNull(),
  quantity: integer("quantity").notNull(),
});

export const returnAllocations = sqliteTable("return_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  logisticsOrderItemId: integer("logistics_order_item_id").notNull(),
  code: text("code").notNull(),
  street: text("street").notNull(),
  column: text("column").notNull(),
  level: text("level").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
