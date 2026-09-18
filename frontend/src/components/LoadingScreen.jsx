import { Loader2 } from "lucide-react";

// Full-screen takeover for the login/logout transition — the abrupt jump
// between the auth form and the sidebar+dashboard (or back) otherwise reads
// as a broken flash rather than a deliberate moment. Theme-token-based, so it
// respects dark mode automatically when shown from inside AdminLayout.
export default function LoadingScreen({ message = "Loading…" }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background">
      <img src="/logo/ksl-mark-simple.svg" alt="" className="h-12 w-12" />
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        {message}
      </div>
    </div>
  );
}
