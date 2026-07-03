"use client";

import { useEffect, useState } from "react";

/**
 * The one debounce primitive (engineering.md §3). Returns `value` delayed by
 * `delayMs`, resetting the timer on every change. Used by every typeahead
 * (PersonPicker, HeaderSearch) so debouncing is never hand-rolled twice.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
