"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setState(error ? "error" : "sent");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-heading text-xl">SearchOS</CardTitle>
        <CardDescription>
          Sign in with your work email. Access is allowlisted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state === "sent" ? (
          <p className="text-sm text-muted-foreground">
            Check your inbox — the sign-in link is on its way.
          </p>
        ) : (
          <form onSubmit={sendLink} className="flex flex-col gap-3">
            <Input
              type="email"
              required
              placeholder="you@offtakesearch.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={state === "sending"}>
              {state === "sending" ? "Sending…" : "Send sign-in link"}
            </Button>
            {(state === "error" || params.get("error")) && (
              <p className="text-sm text-destructive">
                Sign-in failed — try again.
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
