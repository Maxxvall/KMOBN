const lockTails = new Map<string, Promise<void>>();

export const withTableMutationLock = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = lockTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  lockTails.set(key, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (lockTails.get(key) === tail) lockTails.delete(key);
  }
};

