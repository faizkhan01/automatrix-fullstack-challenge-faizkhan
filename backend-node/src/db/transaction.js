import { setTimeout as sleep } from "node:timers/promises";
import { DatabaseError } from "sequelize";
import { sequelize } from "./sequelize.js";

// MySQL rolls the transaction back for these, and the work is safe to run again from scratch.
const TRANSIENT_ERRNOS = new Set([
  1213, // ER_LOCK_DEADLOCK
  1205, // ER_LOCK_WAIT_TIMEOUT
]);

export function isTransientDbError(err) {
  return err instanceof DatabaseError && TRANSIENT_ERRNOS.has(err.parent?.errno);
}

/**
 * Runs `work(transaction)` in a transaction that commits on success and rolls back on any error.
 * Transient errors retry the whole unit of work with jittered exponential backoff.
 *
 * @template T
 * @param {(transaction: import("sequelize").Transaction) => Promise<T>} work
 * @param {{ attempts?: number, baseDelayMs?: number }} [options]
 * @returns {Promise<T>}
 */
export async function withTransaction(work, { attempts = 3, baseDelayMs = 20 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await sequelize.transaction((transaction) => work(transaction));
    } catch (err) {
      if (!isTransientDbError(err) || attempt >= attempts) throw err;

      console.warn(`Transient database error (${err.parent.code}), retrying transaction (attempt ${attempt + 1}/${attempts}).`);
      await sleep(baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random()));
    }
  }
}
