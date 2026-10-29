import { DataTypes } from "sequelize";
import { sequelize } from "../db/sequelize.js";

export const ORDER_STATUSES = ["pending", "paid", "shipped", "cancelled"];

export const Order = sequelize.define(
  "Order",
  {
    reference: { type: DataTypes.STRING, allowNull: false, unique: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: "pending" },
    totalCents: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    placedAt: { type: DataTypes.DATE },
    // Client-supplied Idempotency-Key, so a retried POST returns the original order instead of a duplicate.
    idempotencyKey: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    tableName: "orders",
    indexes: [
      { fields: ["status", "placed_at"] },
      { unique: true, fields: ["customer_id", "idempotency_key"] },
    ],
  },
);
