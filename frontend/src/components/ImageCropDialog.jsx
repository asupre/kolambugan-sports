import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { Label } from "./ui/label";
import { cropToBlob } from "../lib/imageCrop";

// Shared position-and-zoom step for any image upload in the app (site images,
// barangay logos, …) — one cropper implementation instead of one per feature.
export default function ImageCropDialog({
  file,
  aspect = 1,
  cropShape = "rect",
  maxWidth = 1920,
  title,
  description,
  onCancel,
  onSave,
}) {
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
      const blob = await cropToBlob(src, area, maxWidth);
      await onSave(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl! p-0 gap-0 overflow-hidden">
        <div className="px-5 py-3 border-b">
          <h3 className="font-semibold text-sm">{title}</h3>
          {description && <p className="text-muted-foreground text-xs mt-0.5">{description}</p>}
        </div>

        <div className="relative bg-black" style={{ height: 340 }}>
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape={cropShape}
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
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
