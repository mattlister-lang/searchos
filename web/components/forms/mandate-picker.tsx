"use client";

import { searchMandates } from "@/lib/actions";
import { EntityPicker, type PickerHit } from "@/components/forms/entity-picker";

// Module-stable (not exported — L-025) so the picker's search effect keeps a
// stable dependency.
async function searchMandateHits(q: string): Promise<PickerHit[]> {
  const res = await searchMandates({ q });
  if (!res.ok) return [];
  return res.mandates.map((m) => ({ id: m.id, label: m.title, sublabel: m.context }));
}

/**
 * Typeahead job (mandate) selector — the missing primitive for "Add to job"
 * from the person page (E-022). Open mandates rank first; non-open ones are
 * still findable (archived jobs stay linkable, UAT Q4) with their status in
 * the disambiguation line. Same machine as PersonPicker (EntityPicker).
 */
export function MandatePicker(props: {
  value: string;
  onChange: (mandateId: string) => void;
  placeholder?: string;
  /** Display title for a pre-selected `value` (edit forms) — typing replaces it. */
  initialLabel?: string;
}) {
  return (
    <EntityPicker
      value={props.value}
      onChange={props.onChange}
      search={searchMandateHits}
      placeholder={props.placeholder ?? "Search jobs by title…"}
      initialLabel={props.initialLabel}
    />
  );
}
