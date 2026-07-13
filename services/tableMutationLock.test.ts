import { describe, expect, it } from 'vitest';
import { withTableMutationLock } from './tableMutationLock';

const createGate = () => {
  let release!: () => void;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });
  return { promise, release };
};

describe('withTableMutationLock', () => {
  it('runs tasks for the same key serially in FIFO order while the first task is paused', async () => {
    const firstGate = createGate();
    const firstStarted = createGate();
    const events: string[] = [];

    const first = withTableMutationLock('materials:user-a', async () => {
      events.push('first:start');
      firstStarted.release();
      await firstGate.promise;
      events.push('first:end');
      return 'first';
    });
    const second = withTableMutationLock('materials:user-a', async () => {
      events.push('second:start');
      events.push('second:end');
      return 'second';
    });
    const third = withTableMutationLock('materials:user-a', async () => {
      events.push('third:start');
      events.push('third:end');
      return 'third';
    });

    await firstStarted.promise;
    expect(events).toEqual(['first:start']);

    firstGate.release();

    await expect(Promise.all([first, second, third])).resolves.toEqual(['first', 'second', 'third']);
    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
      'third:start',
      'third:end',
    ]);
  });

  it('allows tasks for different keys to overlap', async () => {
    const materialsGate = createGate();
    const worksGate = createGate();
    const materialsStarted = createGate();
    const worksStarted = createGate();
    const active = new Set<string>();

    const materials = withTableMutationLock('materials:user-a', async () => {
      active.add('materials');
      materialsStarted.release();
      await materialsGate.promise;
      active.delete('materials');
    });
    const works = withTableMutationLock('works:user-a', async () => {
      active.add('works');
      worksStarted.release();
      await worksGate.promise;
      active.delete('works');
    });

    await Promise.all([materialsStarted.promise, worksStarted.promise]);
    expect(active).toEqual(new Set(['materials', 'works']));

    materialsGate.release();
    worksGate.release();
    await Promise.all([materials, works]);
    expect(active).toEqual(new Set());
  });

  it('releases the lock when a task rejects', async () => {
    const failingGate = createGate();
    const failingStarted = createGate();
    const events: string[] = [];

    const failing = withTableMutationLock('bundles:user-a', async () => {
      events.push('failing:start');
      failingStarted.release();
      await failingGate.promise;
      events.push('failing:reject');
      throw new Error('mutation failed');
    });
    const rejection = expect(failing).rejects.toThrow('mutation failed');
    const followUp = withTableMutationLock('bundles:user-a', async () => {
      events.push('follow-up:start');
      return 'completed';
    });

    await failingStarted.promise;
    expect(events).toEqual(['failing:start']);
    failingGate.release();

    await rejection;
    await expect(followUp).resolves.toBe('completed');
    expect(events).toEqual(['failing:start', 'failing:reject', 'follow-up:start']);
  });
});
