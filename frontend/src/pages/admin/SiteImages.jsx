import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import AdminLayout from "../../components/AdminLayout";
import { api } from "../../api";
import { Card } from "../../components/ui";

const superAdminMenu = [
  { label: "Dashboard", path: "/admin", icon: "▦" },
  { label: "Season", path: "/admin/season", icon: "◷" },
  { label: "Reference List", path: "/admin/reference", icon: "☑" },
  { label: "Review Queue", path: "/admin/review", icon: "⚑" },
  { label: "Tournaments", path: "/admin/tournaments", icon: "⛃" },
  { label: "Champions", path: "/admin/champions", icon: "★" },
  { label: "Site Images", path: "/admin/site-images", icon: "▣" },
  { label: "Accounts", path: "/admin/accounts", icon: "☺" },
];

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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-slate-800 font-semibold text-sm">Position the photo — {slot.label}</h3>
          <p className="text-slate-500 text-xs mt-0.5">
            Drag to move, and use the slider to zoom. What's inside the frame is
            what appears on the site.
          </p>
        </div>

        <div className="relative bg-slate-900" style={{ height: 340 }}>
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

        <div className="px-5 py-3 border-t border-slate-200">
          <label className="block text-slate-600 text-xs font-medium mb-1.5">Zoom</label>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !area}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
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
    <div className="flex flex-col sm:flex-row gap-4 border border-slate-200 rounded-lg p-4">
      <div className="w-full sm:w-64 shrink-0">
        {slot.hasImage ? (
          <img
            src={`/api/public/site-image/${slot.key}?v=${v}`}
            alt=""
            className="w-full object-cover rounded bg-slate-100"
            style={{ aspectRatio: String(slot.aspect || 1.6) }}
          />
        ) : (
          <div
            className="w-full rounded bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center"
            style={{ aspectRatio: String(slot.aspect || 1.6) }}
          >
            <span className="text-slate-400 text-xs">No image</span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-slate-800 font-medium text-sm">{slot.label}</h3>
        <p className="text-slate-500 text-xs mt-0.5">{slot.where}</p>
        <p className="text-slate-400 text-xs mt-1">{slot.hint}</p>

        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files[0];
            if (f) setPending(f);
            e.target.value = "";   // so picking the same file twice still opens the cropper
          }}
          className="block w-full text-sm text-slate-600 mt-3 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-medium hover:file:bg-indigo-100 cursor-pointer"
        />
        <p className="text-slate-400 text-[11px] mt-1">
          You'll be able to position and zoom it before it's saved.
        </p>

        {slot.hasImage && (
          <button
            onClick={remove}
            disabled={busy}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 mt-3"
          >
            Remove
          </button>
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
    </div>
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
    <AdminLayout title="Site Images" menu={superAdminMenu}>
      <div className="max-w-4xl space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <Card className="p-5">
          <h2 className="text-slate-800 font-semibold mb-1">Photos on the public site</h2>
          <p className="text-slate-500 text-sm">
            These images appear on the public pages. Pick a photo, position it in
            the frame, and it's live — no code change needed. Every image here is
            public, so don't upload anything you wouldn't put on a poster.
          </p>
        </Card>

        {loading ? (
          <p className="text-slate-500">Loading…</p>
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