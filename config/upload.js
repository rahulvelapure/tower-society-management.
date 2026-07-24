const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// NOTE: this directory is local disk and is NOT durable storage - Render's
// free-tier disk is wiped on every deploy/restart. Keep everything that touches
// disk behind this module so swapping to cloud/object storage later (Cloudinary,
// S3, etc.) only requires changing this file, not every caller.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads');

// Allowlist (not blocklist) of what residents/admins can attach - images and PDFs
// only. This blocks executables, scripts, HTML (XSS risk if ever served inline),
// and anything else not explicitly needed for notices/complaint/receipt attachments.
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const societyId = req.user && req.user.society ? String(req.user.society) : 'unassigned';
        const category = req.uploadCategory || 'misc';
        const dir = path.join(UPLOAD_ROOT, societyId, category);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Filenames are always server-generated (never derived from user input beyond
        // the already-validated extension), so there is no path-traversal surface here.
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${unique}${ext}`);
    }
});

function fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
        return cb(new Error('Unsupported file type. Only images (jpg, png, gif, webp) and PDF are allowed.'));
    }
    cb(null, true);
}

// Usage: (req,res,next) => { req.uploadCategory = 'notices'; next(); }, upload.single('attachment')
// Not currently wired into any route - kept ready for the Complaints/Notices phases.
exports.upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

exports.toAttachment = (file, req) => {
    if (!file) return undefined;
    const societyId = req.user && req.user.society ? String(req.user.society) : 'unassigned';
    const category = req.uploadCategory || 'misc';
    return {
        url: `/uploads/${societyId}/${category}/${file.filename}`,
        filename: file.originalname,
        mimeType: file.mimetype,
        uploadedAt: new Date()
    };
};

// Reusable schema for embedding file references on other documents (notices, complaints, etc.)
exports.AttachmentSchema = new mongoose.Schema({
    url: String,
    filename: String,
    mimeType: String,
    uploadedAt: { type: Date, default: Date.now }
}, { _id: false });
