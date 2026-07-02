import { useEffect, useState } from 'react';

// Delays reflecting `value` until it's stopped changing for `delayMs`, so
// the full-page live preview iframe doesn't fully reload on every keystroke.
export function useDebouncedValue(value, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
