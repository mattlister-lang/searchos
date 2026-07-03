"use client";

import { useEffect, useState } from "react";
import { suggestTags } from "@/lib/actions";
import { useDebouncedValue } from "@/lib/use-debounced";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Chip-based tag input with autocomplete (UAT Q6). Existing tags render as
 * removable chips; typing 2+ chars suggests existing values (suggestTags) as
 * click-to-add buttons — preventing taxonomy drift ("hydrogen" vs "hydrogn").
 * Value contract: string[] in, (string[]) => void out. Debouncing + effect
 * shape mirror PersonPicker (the typeahead primitive) so the state reset stays
 * inside the async boundary, not the effect body (L-017).
 */
export function TagInput(props: {
  value: string[];
  onChange: (tags: string[]) => void;
  field: "skills" | "functions" | "sectors";
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounced = useDebouncedValue(text, 250);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const q = debounced.trim();
      if (q.length < 2) {
        if (!ignore) setSuggestions([]);
        return;
      }
      const res = await suggestTags({ field: props.field, q });
      if (ignore) return;
      setSuggestions(res.ok ? res.tags : []);
    })();
    return () => {
      ignore = true;
    };
  }, [debounced, props.field]);

  function addTag(rawValue: string) {
    const t = rawValue.trim().toLowerCase();
    setText("");
    setSuggestions([]);
    if (!t || props.value.includes(t)) return;
    props.onChange([...props.value, t]);
  }

  function removeTag(t: string) {
    props.onChange(props.value.filter((x) => x !== t));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (text.trim()) addTag(text);
    } else if (e.key === "Backspace" && text === "" && props.value.length > 0) {
      removeTag(props.value[props.value.length - 1]);
    }
  }

  // Never suggest a tag that's already selected.
  const visible = suggestions.filter((t) => !props.value.includes(t));

  return (
    <div className="flex flex-col gap-1.5">
      {props.value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {props.value.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1 capitalize">
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Remove ${t}`}
                className="leading-none text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={text}
        placeholder={props.placeholder ?? "Type to add…"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              className="rounded-full border px-2 py-0.5 text-xs capitalize hover:bg-accent hover:text-accent-foreground"
            >
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
