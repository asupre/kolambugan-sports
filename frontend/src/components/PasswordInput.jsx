import { useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";

// A password field with a show/hide (eye) button, so people can check what they typed
// (Sep 2026) — used on every password field: first-login change, the profile panel,
// forgot-password and the recovery code form. Same look as the login page's original
// eye button. The button is out of the tab order (tabIndex -1) so Tab still moves
// field to field.
export function PasswordInput({ className, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn(className, "pr-9")} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

// Live "do the two new passwords match?" line under a confirm field. Nothing until
// the confirm field has something in it.
export function PasswordMatchHint({ password, confirm }) {
  if (!confirm) return null;
  const ok = password === confirm;
  return (
    <p className={cn("flex items-center gap-1 text-xs", ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
      {ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {ok ? "Passwords match" : "Passwords don't match yet"}
    </p>
  );
}
