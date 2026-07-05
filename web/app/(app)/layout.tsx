import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { HeaderSearch } from "@/components/header-search";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/jobs", label: "Jobs" },
  { href: "/companies", label: "Companies" },
  { href: "/deals", label: "Deals" },
  { href: "/people", label: "People" },
  { href: "/billings", label: "Billings" },
  { href: "/reports", label: "Reports" },
  { href: "/radar", label: "Radar" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="flex min-h-svh">
      <aside className="flex w-52 shrink-0 flex-col border-r bg-sidebar p-4">
        <Link href="/" className="font-heading text-lg font-semibold">
          SearchOS
        </Link>
        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/auth/signout" method="post" className="mt-auto">
          <Button variant="ghost" size="sm" type="submit" className="w-full">
            Sign out
          </Button>
        </form>
      </aside>
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <header className="border-b px-6 py-3 lg:px-8">
          <HeaderSearch />
        </header>
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
