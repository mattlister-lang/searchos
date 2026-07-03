"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logActivity } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TYPES = ["call", "meeting", "email", "note", "linkedin_message"] as const;

export function LogActivityDialog(props: {
  personId?: string;
  companyId?: string;
  dealId?: string;
  mandateId?: string;
  contextLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>("call");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function submit() {
    setPending(true);
    setError(null);
    const res = await logActivity({
      type,
      subject,
      body,
      personIds: props.personId ? [props.personId] : [],
      companyId: props.companyId,
      dealId: props.dealId,
      mandateId: props.mandateId,
    });
    setPending(false);
    if (res.ok) {
      setOpen(false);
      setSubject("");
      setBody("");
      router.refresh();
    } else if ("error" in res) {
      setError(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Log activity</Button>} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log activity — {props.contextLabel}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => v && setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="body">Notes</Label>
            <Textarea id="body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : "Log it"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
