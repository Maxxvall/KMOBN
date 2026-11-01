/**
 * Offline operation id for the revision-RPC idempotency contract: a fresh
 * uuid v4 per queued change (crypto.randomUUID when available, RFC-4122
 * fallback otherwise). One definition — the queue, sections RPC wrapper, and
 * Supabase client previously kept three byte-identical copies.
 */
export const createOperationId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
    const random = Math.floor(Math.random() * 16);
    return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
};
