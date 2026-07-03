"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { label as domainLabel } from "@/lib/domain";

/** The one dialog shell (engineering.md §3). */
export function FormDialog(props: {
  trigger: React.ReactElement;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error?: string | null;
  pending: boolean;
  submitLabel: string;
  pendingLabel?: string;
  onSubmit: () => void;
  submitDisabled?: boolean;
  hideSubmit?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger render={props.trigger} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {props.children}
          {props.error && <p className="text-sm text-destructive">{props.error}</p>}
          {!props.hideSubmit && (
            <Button disabled={props.pending || props.submitDisabled} onClick={props.onSubmit}>
              {props.pending ? (props.pendingLabel ?? "Saving…") : props.submitLabel}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Field(props: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{props.label}</Label>
      {props.children}
    </div>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <Field label={props.label}>
      <Input type={props.type ?? "text"} placeholder={props.placeholder}
        value={props.value} onChange={props.onChange} />
    </Field>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  return (
    <Field label={props.label}>
      <Select value={props.value} onValueChange={(v) => v && props.onChange(v)}>
        <SelectTrigger>
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((o) => (
            <SelectItem key={o} value={o} className="capitalize">
              {domainLabel(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
