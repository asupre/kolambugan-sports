import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";

// Replaces window.confirm() app-wide — a native browser confirm blocks the
// whole tab and looks like it came from the OS, not the app. confirm() here
// returns a Promise<boolean> the same way, so every call site just becomes
// `await confirm(...)` in place of the old synchronous window.confirm(...).
const ConfirmDialogContext = createContext(() => Promise.resolve(false));

export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        message,
        title: opts.title || (opts.alertOnly ? "Heads up" : "Are you sure?"),
        confirmLabel: opts.confirmLabel || (opts.alertOnly ? "OK" : "Confirm"),
        cancelLabel: opts.cancelLabel || "Cancel",
        danger: opts.danger ?? false,
        alertOnly: opts.alertOnly ?? false,
      });
    });
  }, []);

  function settle(result) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onOpenChange={(open) => { if (!open) settle(!!state?.alertOnly); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{state?.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{state?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {!state?.alertOnly && (
              <Button variant="outline" onClick={() => settle(false)}>{state?.cancelLabel}</Button>
            )}
            <Button
              onClick={() => settle(true)}
              className={state?.danger ? "bg-red-600 hover:bg-red-700 text-white" : undefined}
            >
              {state?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  );
}

// Returns confirm(message, { title?, confirmLabel?, cancelLabel?, danger? }) => Promise<boolean>.
export function useConfirm() {
  return useContext(ConfirmDialogContext);
}
