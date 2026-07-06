"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { searchAll, type SearchAllResult } from "@/lib/actions";
import { label } from "@/lib/domain";
import { useDebouncedValue } from "@/lib/use-debounced";
import { Input } from "@/components/ui/input";

/**
 * Global search typeahead (UAT Q2). Grouped preview after 3+ chars,
 * keyboard-navigable; Enter with nothing highlighted opens the full results
 * page. Same queries as /search (lib/search.ts via searchAll). First
 * occurrence of this primitive; debouncing from the shared hook.
 */
type Item = { href: string; primary: string; secondary?: string };
type Group = { heading: string; items: Item[] };

export function HeaderSearch() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebouncedValue(text, 250);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const q = debounced.trim();
      if (q.length < 3) {
        if (!ignore) {
          setGroups([]);
          setOpen(false);
        }
        return;
      }
      const res: SearchAllResult = await searchAll({ q });
      if (ignore || !res.ok) return;
      const next: Group[] = [];
      if (res.people.length)
        next.push({
          heading: "People",
          items: res.people.map((p) => ({
            href: `/people/${p.id}`,
            primary: p.full_name,
            secondary: p.location ?? undefined,
          })),
        });
      if (res.companies.length)
        next.push({
          heading: "Companies",
          items: res.companies.map((c) => ({
            href: `/companies/${c.id}`,
            primary: c.name,
            secondary: label(c.status),
          })),
        });
      if (res.jobs.length)
        next.push({
          heading: "Jobs",
          items: res.jobs.map((j) => ({
            href: `/jobs/${j.id}`,
            primary: j.title,
            secondary: j.company?.name ?? undefined,
          })),
        });
      if (res.deals.length)
        next.push({
          heading: "Deals",
          items: res.deals.map((d) => ({
            href: `/deals/${d.id}`,
            primary: d.name,
            secondary: d.company?.name ?? undefined,
          })),
        });
      setGroups(next);
      setActive(-1);
      setOpen(true);
    })();
    return () => {
      ignore = true;
    };
  }, [debounced]);

  const flat = groups.flatMap((g) => g.items);
  const offsets: number[] = [];
  {
    let run = 0;
    for (const g of groups) {
      offsets.push(run);
      run += g.items.length;
    }
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function submitSearch() {
    const q = text.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && flat[active]) go(flat[active].href);
      else submitSearch();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showMenu = open && flat.length > 0;

  return (
    <div
      className="relative max-w-sm"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Input
        value={text}
        placeholder="Search people, companies, jobs, deals…"
        onChange={(e) => setText(e.target.value)}
        onFocus={() => flat.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showMenu}
        autoComplete="off"
      />
      {showMenu && (
        <div className="absolute z-50 mt-1 max-h-96 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {groups.map((group, gi) => (
            <div key={group.heading} className="py-1">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{group.heading}</p>
              {group.items.map((item, ii) => {
                const i = offsets[gi] + ii;
                return (
                  <Link
                    key={`${group.heading}-${i}`}
                    href={item.href}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setOpen(false)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-baseline gap-2 rounded-sm px-2 py-1.5 text-sm ${
                      i === active ? "bg-accent text-accent-foreground" : ""
                    }`}
                  >
                    <span className="font-medium">{item.primary}</span>
                    {item.secondary && (
                      <span className="truncate text-xs text-muted-foreground">{item.secondary}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
