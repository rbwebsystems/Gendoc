export const CASH_REMOTE_WRITE_DELAY_MS = 40;
export const STANDARD_REMOTE_WRITE_DELAY_MS = 120;
export const MAX_REMOTE_WRITE_LATENCY_MS = 350;

/**
 * Keep rapid edits in one write without letting continuous typing postpone
 * realtime sync indefinitely.
 */
export function remoteWriteDelayMs(options: {
  cashDirty: boolean;
  queuedAt: number;
  now: number;
}): number {
  const debounce = options.cashDirty ? CASH_REMOTE_WRITE_DELAY_MS : STANDARD_REMOTE_WRITE_DELAY_MS;
  const remainingMaximum = Math.max(0, MAX_REMOTE_WRITE_LATENCY_MS - (options.now - options.queuedAt));
  return Math.min(debounce, remainingMaximum);
}
