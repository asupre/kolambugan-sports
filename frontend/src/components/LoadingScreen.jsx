// Full-screen takeover for the login/logout transition — the abrupt jump
// between the auth form and the sidebar+dashboard (or back) otherwise reads
// as a broken flash rather than a deliberate moment. Theme-token-based, so it
// respects dark mode automatically when shown from inside AdminLayout.
export default function LoadingScreen({ message = "Loading…" }) {
  return (
    <div className="fixed inset-0 z-(--z-loading) flex flex-col items-center justify-center gap-6 bg-background">
      <div className="relative flex items-center justify-center">
        <span className="absolute size-32 rounded-full bg-primary/15 animate-ping [animation-duration:1.8s]" />
        <span className="absolute size-24 rounded-full bg-primary/10" />
        <img
          src="/logo/ksl-mark-simple.svg"
          alt=""
          className="relative size-20 animate-pulse [animation-duration:1.8s] drop-shadow-lg"
        />
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-base font-medium text-foreground">{message}</p>
        <span className="h-1 w-40 overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-1/3 animate-[loading-bar_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </span>
      </div>
    </div>
  );
}
