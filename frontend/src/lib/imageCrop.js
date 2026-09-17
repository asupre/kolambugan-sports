function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = url;
  });
}

// Cuts the chosen region out of the source image at full resolution, then
// scales it down if it's wider than maxWidth. Returns a JPEG blob.
export async function cropToBlob(src, crop, maxWidth) {
  const image = await loadImage(src);
  const scale = Math.min(1, maxWidth / crop.width);
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
