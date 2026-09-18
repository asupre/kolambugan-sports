import { useEffect, useState } from "react";
import { ImageIcon, Trash2 } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { useErrorDialog } from "../../components/ErrorDialog";
import { useConfirm } from "../../components/ConfirmDialog";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import ImageCropDialog from "../../components/ImageCropDialog";

// Widest we'll store. A phone photo is far larger than any slot renders, and a
// 12-megapixel banner is just bandwidth nobody sees.
const MAX_WIDTH = 1920;

function Slot({ slot, onChanged, onError }) {
  const confirm = useConfirm();
  const [pending, setPending] = useState(null);   // file awaiting crop
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(Date.now());         // cache-buster after a change

  async function uploadBlob(blob) {
    setBusy(true);
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append("image", blob, `site-${slot.key}.jpg`);
      const res = await fetch(`/api/site-images/${slot.key}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { onError(data.message || "Upload failed."); return; }
      setPending(null);
      setV(Date.now());
      onChanged();
    } catch {
      onError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirm(`Remove the image for "${slot.label}"? The placeholder will show instead.`, { danger: true, confirmLabel: "Remove" }))) return;
    setBusy(true);
    try {
      await api(`/api/site-images/${slot.key}`, { method: "DELETE" });
      setV(Date.now());
      onChanged();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-64 shrink-0">
          {slot.hasImage ? (
            <img
              src={`/api/public/site-image/${slot.key}?v=${v}`}
              alt=""
              className="w-full object-cover rounded bg-muted"
              style={{ aspectRatio: String(slot.aspect || 1.6) }}
            />
          ) : (
            <div
              className="w-full rounded bg-muted border border-dashed flex items-center justify-center gap-1.5 text-muted-foreground text-xs"
              style={{ aspectRatio: String(slot.aspect || 1.6) }}
            >
              <ImageIcon className="size-4" /> No image
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sm">{slot.label}</h3>
          <p className="text-muted-foreground text-xs mt-0.5">{slot.where}</p>
          <p className="text-muted-foreground text-xs mt-1">{slot.hint}</p>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) setPending(f);
              e.target.value = "";   // so picking the same file twice still opens the cropper
            }}
            className="block w-full text-sm text-muted-foreground mt-3 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-medium hover:file:bg-primary/15 cursor-pointer"
          />
          <p className="text-muted-foreground text-[11px] mt-1">
            You'll be able to position and zoom it before it's saved.
          </p>

          {slot.hasImage && (
            <Button size="sm" variant="destructive" onClick={remove} disabled={busy} className="mt-3">
              <Trash2 /> Remove
            </Button>
          )}
        </div>

        {pending && (
          <ImageCropDialog
            file={pending}
            aspect={slot.aspect || 1.6}
            maxWidth={MAX_WIDTH}
            title={`Position the photo — ${slot.label}`}
            description="Drag to move, and use the slider to zoom. What's inside the frame is what appears on the site."
            onCancel={() => setPending(null)}
            onSave={uploadBlob}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function SiteImages() {
  const showError = useErrorDialog();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      const d = await api("/api/site-images");
      setSlots(d.slots || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AdminLayout title="Site Images" menu={superAdminMenu} enableDarkMode>
      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="size-4 text-blue-500" /> Photos on the public site
            </CardTitle>
            <CardDescription>
              These images appear on the public pages. Pick a photo, position it in
              the frame, and it's live — no code change needed. Every image here is
              public, so don't upload anything you wouldn't put on a poster.
            </CardDescription>
          </CardHeader>
        </Card>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-4">
            {slots.map((s) => (
              <Slot key={s.key} slot={s} onChanged={load} onError={showError} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
