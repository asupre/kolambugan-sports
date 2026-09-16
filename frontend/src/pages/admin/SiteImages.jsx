import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { ImageIcon, Trash2 } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { superAdminMenu } from "../../components/menus";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Skeleton } from "../../components/ui/skeleton";

// Widest we'll store. A phone photo is far larger than any slot renders, and a
// 12-megapixel banner is just bandwidth nobody sees.
const MAX_WIDTH = 1920;

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = url;
  });
}

// Cut the chosen region out of the original at full resolution, then scale it
// down if it's wider than we need. Returns a JPEG blob ready to upload.
async function getCroppedBlob(src, crop) {
  const image = await createImage(src);
  const scale = Math.min(1, MAX_WIDTH / crop.width);
  const w = Math.round(crop.width * scale);
  const h = Math.round(crop.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

function CropModal({ slot, file, onCancel, onDone }) {
  const [src, setSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropComplete = useCallback((_, pixels) => setArea(pixels), []);

  async function save() {
    if (!area) return;
    setBusy(true);
    try {
      const blob = await getCroppedBlob(src, area);
      await onDone(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl! p-0 gap-0 overflow-hidden">
        <div className="px-5 py-3 border-b">
          <h3 className="font-semibold text-sm">Position the photo — {slot.label}</h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            Drag to move, and use the slider to zoom. What's inside the frame is
            what appears on the site.
          </p>
        </div>

        <div className="relative bg-black" style={{ height: 340 }}>
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={slot.aspect || 1.6}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition={false}
            />
          )}
        </div>

        <div className="px-5 py-3 border-t">
          <Label className="text-xs font-normal text-muted-foreground mb-1.5">Zoom</Label>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !area}>
            {busy ? "Saving…" : "Save photo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Slot({ slot, onChanged, onError }) {
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
    if (!window.confirm(`Remove the image for "${slot.label}"? The placeholder will show instead.`)) return;
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
          <CropModal
            slot={slot}
            file={pending}
            onCancel={() => setPending(null)}
            onDone={uploadBlob}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function SiteImages() {
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
      <div className="max-w-4xl space-y-6">
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
              <Slot key={s.key} slot={s} onChanged={load} onError={setError} />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
