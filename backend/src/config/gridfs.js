// src/config/gridfs.js
// GridFS storage for player photos and residency documents.
// Files live in MongoDB itself — no filesystem, works on Render's ephemeral disk.

const mongoose = require('mongoose');
const multer = require('multer');
const { GridFSBucket, ObjectId } = require('mongodb');

// One bucket for photos, one for documents — keeps them separate and lets us
// serve photos publicly while documents stay behind an auth check.
function bucket(name) {
  return new GridFSBucket(mongoose.connection.db, { bucketName: name });
}

// Multer keeps the file in memory; we stream it into GridFS ourselves.
const PHOTO_MAX = 3 * 1024 * 1024;   // 3 MB — plenty for a headshot
const DOC_MAX = 8 * 1024 * 1024;     // 8 MB — scanned IDs / certificates

const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(new Error('Photo must be a JPEG, PNG, or WebP image.'));
    }
    cb(null, true);
  },
});

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOC_MAX },
  fileFilter: (req, file, cb) => {
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.mimetype)) {
      return cb(new Error('Document must be an image or a PDF.'));
    }
    cb(null, true);
  },
});

// Write a buffer into a bucket; resolves with the new file's id.
function putFile(bucketName, buffer, filename, contentType, metadata = {}) {
  return new Promise((resolve, reject) => {
    const stream = bucket(bucketName).openUploadStream(filename, {
      contentType,
      metadata: { ...metadata, contentType },   // belt and braces
    });
    stream.on('error', reject);
    stream.on('finish', () => resolve(stream.id));
    stream.end(buffer);
  });
}

// Pipe a stored file out to an Express response.
async function sendFile(bucketName, id, res, cacheSeconds = 86400) {
  let _id;
  try { _id = new ObjectId(String(id)); } catch { return res.status(400).json({ message: 'Bad file id.' }); }
  const files = await bucket(bucketName).find({ _id }).toArray();
  if (!files.length) return res.status(404).json({ message: 'File not found.' });
  const type = files[0].contentType || files[0].metadata?.contentType || 'application/octet-stream';
  res.set('Content-Type', type);
    res.set('Cache-Control', `public, max-age=${cacheSeconds}`);
  bucket(bucketName).openDownloadStream(_id).pipe(res);
}

// Remove a stored file (ignore if already gone).
async function deleteFile(bucketName, id) {
  try { await bucket(bucketName).delete(new ObjectId(String(id))); } catch { /* already gone */ }
}

module.exports = { uploadPhoto, uploadDoc, putFile, sendFile, deleteFile, PHOTO_MAX, DOC_MAX };