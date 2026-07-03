"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updatePersonProfile } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const SENIORITY = ["junior", "mid", "senior", "manager", "head", "director", "vp", "c_suite"];

export function EditProfileDialog(props: {
  personId: string;
  seniority: string | null;
  functions: string[];
  skills: string[];
  sectors: string[];
  location: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    seniority: props.seniority ?? "",
    functions: props.functions.join(", "),
    skills: props.skills.join(", "),
    sectors: props.sectors.join(", "),
    location: props.location ?? "",
  });

  async function submit() {
    setPending(true);
    setError(null);
    const res = await updatePersonProfile({ personId: props.personId, ...form });
    setPending(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else if ("error" in res) setError(res.error);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Edit profile</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Profile & matching attributes</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Seniority</Label>
            <Select value={form.seniority}
              onValueChange={(v) => v && setForm({ ...form, seniority: v })}>
              <SelectTrigger><SelectValue placeholder="Pick a level" /></SelectTrigger>
              <SelectContent>
                {SENIORITY.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Functions (comma-separated)</Label>
            <Input placeholder="commercial, origination" value={form.functions}
              onChange={(e) => setForm({ ...form, functions: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Skills (comma-separated)</Label>
            <Input placeholder="ppa, project finance" value={form.skills}
              onChange={(e) => setForm({ ...form, skills: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Sectors (hydrogen, zev, solar, battery, grid, flexibility, other)</Label>
            <Input value={form.sectors}
              onChange={(e) => setForm({ ...form, sectors: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Location</Label>
            <Input value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
