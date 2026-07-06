"use client";

import { searchPeople } from "@/lib/actions";
import { EntityPicker, type PickerHit } from "@/components/forms/entity-picker";

// Module-stable (not exported — client modules export components/hooks only,
// L-025) so EntityPicker's search effect keeps a stable dependency.
async function searchPeopleHits(q: string): Promise<PickerHit[]> {
  const res = await searchPeople({ q });
  if (!res.ok) return [];
  return res.people.map((p) => ({ id: p.id, label: p.fullName, sublabel: p.currentRole }));
}

/**
 * Typeahead person selector (UAT Q1) — a search, not a dropdown, so it scales
 * to thousands. Reused anywhere a person is picked. The state machine lives in
 * EntityPicker (extracted at the second occurrence, engineering.md §3).
 */
export function PersonPicker(props: {
  value: string;
  onChange: (personId: string) => void;
  placeholder?: string;
  /** Display name for a pre-selected `value` (edit forms) — typing replaces it. */
  initialLabel?: string;
}) {
  return (
    <EntityPicker
      value={props.value}
      onChange={props.onChange}
      search={searchPeopleHits}
      placeholder={props.placeholder ?? "Search people…"}
      initialLabel={props.initialLabel}
    />
  );
}
