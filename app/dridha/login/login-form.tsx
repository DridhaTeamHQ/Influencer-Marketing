"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { login, type LoginState } from "./actions";

/** `from` is read from the URL unless passed in (the Suspense fallback passes null). */
export function LoginForm({ from }: { from?: string | null }) {
  return from === undefined ? <FormWithParams /> : <Form from={from} />;
}

function FormWithParams() {
  return <Form from={useSearchParams().get("from")} />;
}

function Form({ from }: { from: string | null }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="from" value={from ?? ""} />
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            defaultValue={state.username}
            required
            autoFocus
          />
        </Field>
        <Field data-invalid={!!state.error || undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={!!state.error}
          />
          {state.error && <FieldError>{state.error}</FieldError>}
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Spinner />}
          Sign in
        </Button>
      </FieldGroup>
    </form>
  );
}
