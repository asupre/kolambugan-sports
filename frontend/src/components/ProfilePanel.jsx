import { useEffect, useState } from "react";
import { Camera, Check, Copy, KeyRound, Loader2, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { api } from "../api";
import ImageCropDialog from "./ImageCropDialog";
import { useConfirm } from "./ConfirmDialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { PasswordInput, PasswordMatchHint } from "./PasswordInput";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";

const ROLE_LABEL = { super_admin: "Super Admin", barangay_admin: "Barangay Admin", organizer: "Organizer" };

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}

// Change-password section — same rules as the forced first-login change
// (routes/auth.js POST /change-password), just reachable any time from here.
function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setOk(false);
    if (newPassword.length < 8) return setError("New password must be at least 8 characters.");
    if (newPassword !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword(""); setNewPassword(""); setConfirm("");
      setOk(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-sm font-medium">Change password</h3>
      <div className="space-y-1.5">
        <Label htmlFor="pp-current">Current password</Label>
        <PasswordInput id="pp-current" value={currentPassword}
          onChange={(e) => { setCurrentPassword(e.target.value); setOk(false); }} autoComplete="current-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pp-new">New password</Label>
        <PasswordInput id="pp-new" value={newPassword}
          onChange={(e) => { setNewPassword(e.target.value); setOk(false); }}
          placeholder="At least 8 characters" autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pp-confirm">Confirm new password</Label>
        <PasswordInput id="pp-confirm" value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setOk(false); }} autoComplete="new-password" />
        <PasswordMatchHint password={newPassword} confirm={confirm} />
      </div>
      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}
      {ok && (
        <Alert className="border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400">
          <Check className="size-4" />
          <AlertDescription>Password changed.</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="sm" disabled={busy || !currentPassword || !newPassword || !confirm}>
        {busy ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}

// Account-recovery section — Super Admin only. See routes/auth.js
// POST /recovery-code. The code is only ever shown here, once, right after
// it's generated — after that only "set on <date>" is known, never the code
// itself.
function RecoverySection({ profile, onGenerated }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealedCode, setRevealedCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  async function generate(e) {
    e.preventDefault();
    setError(""); setRevealedCode(""); setConfirmed(false);
    if (!currentPassword) return setError("Enter your current password.");
    setBusy(true);
    try {
      const data = await api("/api/auth/recovery-code", {
        method: "POST",
        body: JSON.stringify({ currentPassword }),
      });
      setRevealedCode(data.code);
      setCurrentPassword("");
      onGenerated(data.recoveryCodeSetAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (revealedCode) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5"><KeyRound className="size-4" /> Your new recovery code</h3>
        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400">
          <ShieldAlert className="size-4" />
          <AlertDescription>
            Save this somewhere safe now. It will never be shown again. Anyone signed in as you
            generated a NEW code just now, which replaced any earlier one.
          </AlertDescription>
        </Alert>
        <div className="flex items-center gap-2">
          <code className="flex-1 font-mono text-sm bg-muted rounded-md px-3 py-2 tracking-wide">{revealedCode}</code>
          <CopyButton text={revealedCode} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I've saved this code somewhere safe.
        </label>
        <Button type="button" size="sm" variant="outline" disabled={!confirmed} onClick={() => setRevealedCode("")}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={generate} className="space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-1.5"><KeyRound className="size-4" /> Account recovery</h3>
      <p className="text-xs text-muted-foreground">
        A backup code for resetting your password if you're ever locked out, used from "Forgot
        your password?" on the sign-in page. Only you have this code; generating a new one replaces
        the old one and does not affect any other Super Admin's code.
      </p>
      <p className="text-xs">
        {profile?.hasRecoveryCode
          ? <span className="text-muted-foreground">Recovery code set on {new Date(profile.recoveryCodeSetAt).toLocaleDateString()}.</span>
          : <span className="text-amber-600 dark:text-amber-400 font-medium">No recovery code set yet.</span>}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="pp-recovery-pw">Current password</Label>
        <PasswordInput id="pp-recovery-pw" value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={busy || !currentPassword}>
        {busy ? "Generating…" : profile?.hasRecoveryCode ? "Generate new recovery code" : "Generate recovery code"}
      </Button>
    </form>
  );
}

// Profile picture — same crop-before-upload pattern as the Barangay Admin's
// logo uploader (LogoCard in BrgyDashboard.jsx): the avatar itself is the
// upload control (hover to change), a round crop step before saving, GridFS
// 'photos' bucket, served publicly like a player photo.
function AvatarUpload({ userId, hasPhoto, onChanged }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [v, setV] = useState(Date.now());   // cache-buster after a change
  const [pending, setPending] = useState(null);   // file awaiting crop
  const [imgError, setImgError] = useState(false);

  async function uploadBlob(blob) {
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("photo", blob, "photo.jpg");
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/profile/photo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed.");
      setPending(null);
      setImgError(false);
      setV(Date.now());
      onChanged(true);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!(await confirm("Remove your profile picture? Your initials will show instead.", { danger: true, confirmLabel: "Remove" }))) return;
    setBusy(true); setError("");
    try {
      await api("/api/auth/profile/photo", { method: "DELETE" });
      setV(Date.now());
      onChanged(false);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const user = JSON.parse(localStorage.getItem("user") || "null");
  const showPhoto = hasPhoto && !imgError;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <label className={cn("group relative h-16 w-16 shrink-0 rounded-full overflow-hidden border bg-muted", busy ? "cursor-wait" : "cursor-pointer")}>
          {showPhoto ? (
            <img
              src={`/api/auth/users/${userId}/photo?rev=${v}`}
              alt=""
              decoding="async"
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground text-lg font-semibold">
              {user?.username?.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
            {busy ? <Loader2 className="size-4 animate-spin" /> : (
              <>
                <Camera className="size-4" />
                <span className="text-[9px] font-medium">{showPhoto ? "Change" : "Upload"}</span>
              </>
            )}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) setPending(f);
              e.target.value = "";
            }}
          />
        </label>
        {showPhoto && (
          <Button size="sm" variant="outline" onClick={remove} disabled={busy} className="text-destructive hover:text-destructive">
            <Trash2 /> Remove
          </Button>
        )}
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {pending && (
        <ImageCropDialog
          file={pending}
          aspect={1}
          cropShape="round"
          maxWidth={600}
          title="Position your photo"
          description="Drag to move, and use the slider to zoom."
          onCancel={() => setPending(null)}
          onSave={uploadBlob}
        />
      )}
    </div>
  );
}

export default function ProfilePanel({ open, onOpenChange }) {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    // Wait out the sheet's ~200ms slide-in transition before doing async work —
    // firing the fetch (and the re-render/avatar-image-load it triggers) at the
    // same instant as the CSS animation starts is what made this feel janky on
    // lower-power phones: the animation and the fetch/render were competing for
    // the same frame budget right when the panel is moving.
    const t = setTimeout(() => {
      api("/api/auth/profile").then(setProfile).catch((e) => setError(e.message));
    }, 220);
    return () => clearTimeout(t);
  }, [open]);

  return (
    // NON-MODAL on purpose (Sep 2026, measured on a phone-sized screen at 6x CPU
    // throttle in headless Edge). A modal Radix dialog, right as it opens, locks page
    // scroll, aria-hides the page and sets `pointer-events: none` on <body>; each
    // forces a whole-page style recalc, which blocked the main thread ~150-190ms
    // straight after mount, so the slide skipped its first frames ("laggy"). Non-modal
    // + the plain `lightBackdrop` (tap closes; touch-none) + `overscroll-contain` on
    // the panel body give the same feel: open-time blocking ~250ms -> ~60ms, worst
    // frame gap 234-300ms -> 83-100ms, for all three roles.
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      {/* No focus at the moment the panel opens (Sep 2026, measured). Radix
          focuses something inside on mount, and ANY focus() there forces a full
          synchronous layout on the very frame the slide starts: ~185ms at 6x CPU
          throttle. Radix's default target was also "Current password" for
          accounts without a photo, which popped the phone keyboard mid-slide.
          So: cancel it, and focus the panel itself once the 200ms slide is done
          (keyboard / screen-reader users still land inside it). */}
      <SheetContent lightBackdrop aria-modal="true"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const panel = e.currentTarget;
          setTimeout(() => {
            if (panel?.isConnected && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
          }, 260);
        }}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><UserRound className="size-4" /> Profile</SheetTitle>
          <SheetDescription>Manage your sign-in details.</SheetDescription>
        </SheetHeader>

        <div className="space-y-2">
          <AvatarUpload
            userId={user?.id}
            hasPhoto={!!profile?.hasPhoto}
            onChanged={(hasPhoto) => setProfile((p) => ({ ...p, hasPhoto }))}
          />
          <div className="min-w-0">
            <p className="font-medium truncate">{user?.username}</p>
            <Badge variant="outline">{ROLE_LABEL[user?.role] || user?.role}</Badge>
          </div>
        </div>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <Separator />
        <ChangePasswordSection />

        {user?.role === "super_admin" && (
          <>
            <Separator />
            <RecoverySection
              profile={profile}
              onGenerated={(recoveryCodeSetAt) => setProfile((p) => ({ ...p, hasRecoveryCode: true, recoveryCodeSetAt }))}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
