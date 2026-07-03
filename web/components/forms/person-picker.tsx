"use client";

import { useEffect, useRef, useState } from "react";
import { searchPeople, type PersonHit } from "@/lib/actions";
import { useDebouncedValue } from "@/lib/use-debounced";
import { Input } from "@/components/ui/input";

/**
 * Typeahead person selector (UAT Q1) — a search, not a dropdown, so it scales
 * to thousands. First occurrence of this primitive; reused anywhere a person
 * is picked. Debouncing comes from the shared hook (lib/use-debounced).
 */
export function PersonPicker(props: {
  value: string;
  onChange: (personId: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<PersonHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedRef = useRef(false);
  const debounced = useDebouncedValue(text, 250);

  useEffect(() => {
    if (selectedRef.current) return; // a chosen person shouldn't re-trigger search
    let ignore = false;
    (async () => {
      const q = debounced.trim();
      if (q.length < 2) {
        if (!ignore) setResults([]);
        return;
      }
      const res = await searchPeople({ q });
      if (ignore) return;
      if (res.ok) {
        setResults(res.people);
        setActive(0);
        setOpen(true);
      } else {
        setResults([]);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [debounced]);

  function pick(hit: PersonHit) {
    selectedRef.current = true;
    setText(hit.fullName);
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
        placeholder={props.placeholder ?? "Search people…"}
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
                <span className="text-sm font-medium">{hit.fullName}</span>
                {hit.currentRole && (
                  <span className="text-xs text-muted-foreground">{hit.currentRole}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
