"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
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
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction}>
      <input type="hidden" name="from" value={from ?? ""} />
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="team@dailymattr.com"
            defaultValue={state.email}
            required
            autoFocus
          />
        </Field>
        <Field data-invalid={!!state.error || undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              aria-invalid={!!state.error}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
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
