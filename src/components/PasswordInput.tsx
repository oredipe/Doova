"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

/** A password field with a show/hide eye button. Takes the same props as an <input>. */
export function PasswordInput({ className = "c-input", style, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  return (
    <span className="c-pass">
      <input {...rest} type={shown ? "text" : "password"} className={className} style={{ ...style, paddingRight: 52 }}
        autoCapitalize="none" spellCheck={false} />
      <button type="button" className="c-pass-eye" onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} aria-controls={rest.id}>
        <Icon name={shown ? "eyeoff" : "eye"} size={20} />
      </button>
    </span>
  );
}
