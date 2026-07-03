"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { label as domainLabel } from "@/lib/domain";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/**
 * Querystring-driven filters (UAT Q3) — one shared component for every list
 * page. Each filter maps a URL param to a Select; changing it router.replaces
 * the URL and the server page re-reads searchParams. First and only home for
 * this pattern (engineering.md §3): pages describe filters, this renders them.
 */
export type FilterSpec = {
  param: string;
  label: string;
  options: { value: string; label: string }[];
};

/** Sentinel for the "any value" option — clears the param. Never a real value
 *  (Base UI Select needs a concrete value; an empty string is ambiguous). */
const ANY = "__any__";

/** Domain list → Select options, labelled the same way as everywhere else. */
export function toOptions(values: readonly string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: domainLabel(v) }));
}

export function FilterBar({ filters }: { filters: FilterSpec[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ANY) params.delete(param);
    else params.set(param, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => {
        const current = searchParams.get(f.param) ?? ANY;
        return (
          <Select key={f.param} value={current} onValueChange={(v) => v && update(f.param, v)}>
            <SelectTrigger size="sm" className="w-auto min-w-36 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY} className="capitalize">
                Any {f.label.toLowerCase()}
              </SelectItem>
              {f.options.map((o) => (
                <SelectItem key={o.value} value={o.value} className="capitalize">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
    </div>
  );
}
