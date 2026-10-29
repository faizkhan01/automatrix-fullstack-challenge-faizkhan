import { ConnectionError, DatabaseError } from "sequelize";

/** An expected failure whose `message` is safe to show to end users. */
export class HttpError extends Error {
  constructor(status, message, errors = undefined, options = undefined) {
    super(message, options);
    this.status = status;
    this.errors = errors;
  }
}

export class ValidationError extends HttpError {
  constructor(errors) {
    super(422, Object.values(errors)[0][0], errors);
  }
}

export class InsufficientStockError extends HttpError {
  constructor(product, requested) {
    const message = `Only ${product.stock} of ${product.sku} left in stock (requested ${requested}).`;
    super(422, message, { items: [message] });
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(message = "The service is temporarily unavailable. Please try again in a moment.", options = undefined) {
    super(503, message, undefined, options);
  }
}

// Seconds a client should wait before retrying after a 503.
const RETRY_AFTER_SECONDS = 5;

/**
 * Responses only ever carry `{ message, errors? }` with user-safe text.
 * SQL, driver codes and stack traces go to the server log, never to the client.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    if (err.status >= 500) console.error(err.cause ?? err);
    if (err.status === 503) res.set("Retry-After", String(RETRY_AFTER_SECONDS));
    return res.status(err.status).json({ message: err.message, ...(err.errors && { errors: err.errors }) });
  }

  // Client mistakes raised by middleware (e.g. express.json on a malformed body).
  if (err.expose && err.status >= 400 && err.status < 500) {
    const message = err.type === "entity.parse.failed" ? "The request body must be valid JSON." : err.message;
    return res.status(err.status).json({ message });
  }

  console.error(err);

  if (err instanceof DatabaseError || err instanceof ConnectionError) {
    const unavailable = new ServiceUnavailableError();
    res.set("Retry-After", String(RETRY_AFTER_SECONDS));
    return res.status(unavailable.status).json({ message: unavailable.message });
  }

  res.status(500).json({ message: "Something went wrong on our side. Please try again." });
}
