"use client";

import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/lib/use-debounced";
import { Input } from "@/components/ui/input";

export type PickerHit = { id: string; label: string; sublabel?: string };

/**
 * The one typeahead entity-picker machine (engineering.md §3). First built as
 * PersonPicker (UAT Q1); extracted on its second occurrence — MandatePicker
 * for "Add to job" (E-022) — because second occurrence = extract, third
 * hand-roll = defect (L-003). PersonPicker / MandatePicker stay the public
 * faces; this owns the debounce, keyboard nav and selection state.
 *
 * `search` must be a module-stable function (define it at module level in the
 * wrapper, unexported — L-025) so the effect below doesn't re-fire on every
 * parent render.
 */
export function EntityPicker(props: {
  value: string;
  onChange: (id: string) => void;
  /** Module-stable search: query → hits; resolve to [] on failure. */
  search: (q: string) => Promise<PickerHit[]>;
  placeholder?: string;
  /** Display label for a pre-selected `value` (edit forms) — typing replaces it (L-029). */
  initialLabel?: string;
}) {
  const { search } = props;
  const [text, setText] = useState(props.initialLabel ?? "");
  const [results, setResults] = useState<PickerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedRef = useRef(Boolean(props.initialLabel));
  const debounced = useDebouncedValue(text, 250);

  useEffect(() => {
    if (selectedRef.current) return; // a chosen entity shouldn't re-trigger search
    let ignore = false;
    (async () => {
      const q = debounced.trim();
      if (q.length < 2) {
        if (!ignore) setResults([]);
        return;
      }
      const hits = await search(q);
      if (ignore) return;
      setResults(hits);
      setActive(0);
      if (hits.length > 0) setOpen(true);
    })();
    return () => {
      ignore = true;
    };
  }, [debounced, search]);

  function pick(hit: PickerHit) {
    selectedRef.current = true;
    setText(hit.label);
    setResults([]);
    setOpen(false);
    props.onChange(hit.id);
  }

  function clear() {
    selectedRef.current = false;
    setText("");
    setResults([]);
    setOpen(false);
    props.onChange("");
  }

  function onType(v: string) {
    selectedRef.current = false;
    setText(v);
    setOpen(true);
    if (props.value) props.onChange(""); // typing invalidates a prior selection
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showMenu = open && results.length > 0;

  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Input
        value={text}
        placeholder={props.placeholder}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showMenu}
        autoComplete="off"
      />
      {text && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear selection"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-lg leading-none text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      )}
      {showMenu && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {results.map((hit, i) => (
            <li key={hit.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(hit)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left ${
                  i === active ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                <span className="text-sm font-medium">{hit.label}</span>
                {hit.sublabel && (
                  <span className="text-xs text-muted-foreground">{hit.sublabel}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
