import { useEffect, useMemo, useRef } from 'react';
import debounce from 'lodash.debounce';

export type DebouncedFunction<TArgs extends unknown[]> = ((...args: TArgs) => void) & {
  cancel: () => void;
  flush: () => void;
};

export function useDebouncedSave<TArgs extends unknown[]>(
  saveFn: (...args: TArgs) => void | Promise<void>,
  delayMs: number,
): DebouncedFunction<TArgs> {
  const saveRef = useRef(saveFn);

  useEffect(() => {
    saveRef.current = saveFn;
  }, [saveFn]);

  const debounced = useMemo(() => {
    const fn = debounce((...args: TArgs) => {
      void saveRef.current(...args);
    }, delayMs);

    return fn as DebouncedFunction<TArgs>;
  }, [delayMs]);

  useEffect(() => {
    return () => {
      debounced.cancel();
    };
  }, [debounced]);

  return debounced;
}
