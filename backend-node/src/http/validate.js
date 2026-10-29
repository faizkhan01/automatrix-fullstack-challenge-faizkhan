import { ValidationError } from "./errors.js";

/**
 * Minimal Laravel-style validation: collects messages per field and throws
 * a ValidationError (422) with { message, errors } if anything failed.
 */
export function validator() {
  const errors = {};

  return {
    check(field, ok, message) {
      if (!ok) (errors[field] ??= []).push(message);
      return ok;
    },
    passOrThrow() {
      if (Object.keys(errors).length > 0) throw new ValidationError(errors);
    },
  };
}

export const isPositiveInt = (value) => Number.isInteger(value) && value > 0;

/** Parses a query-string value as a positive integer, or returns `fallback`. */
export function positiveIntOr(value, fallback) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return isPositiveInt(parsed) ? parsed : fallback;
}
