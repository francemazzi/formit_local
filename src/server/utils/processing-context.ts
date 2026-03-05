import { AsyncLocalStorage } from "node:async_hooks";

export interface ProcessingContext {
  userId?: string;
}

export const processingContext = new AsyncLocalStorage<ProcessingContext>();

/**
 * Get the current userId from the processing context (if any).
 * Returns undefined if not running inside a processing context.
 */
export function getCurrentUserId(): string | undefined {
  return processingContext.getStore()?.userId;
}

/**
 * Run a function within a processing context that carries the userId.
 * Used by the queue worker so that getApiKeys() can resolve per-user keys.
 */
export function runWithUserId<T>(userId: string, fn: () => T | Promise<T>): T | Promise<T> {
  return processingContext.run({ userId }, fn);
}
