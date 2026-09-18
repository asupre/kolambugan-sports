import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";

// A page-level action (e.g. "Create team") can be far down a long page, while
// the resulting error used to render as a banner pinned to the TOP of the
// page — invisible unless the user scrolled up. A centered modal is visible
// regardless of scroll position, so this replaces that pattern app-wide.
const ErrorDialogContext = createContext(() => {});

export function ErrorDialogProvider({ children }) {
  const [message, setMessage] = useState("");

  const showError = useCallback((msg) => {
    setMessage(typeof msg === "string" ? msg : "Something went wrong.");
  }, []);

  return (
    <ErrorDialogContext.Provider value={showError}>
      {children}
      <Dialog open={!!message} onOpenChange={(open) => { if (!open) setMessage(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" /> Can't do that
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line max-h-[50vh] overflow-y-auto">
              {message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setMessage("")}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ErrorDialogContext.Provider>
  );
}

// Returns showError(message) — call it from any catch block to pop the modal.
export function useErrorDialog() {
  return useContext(ErrorDialogContext);
}
