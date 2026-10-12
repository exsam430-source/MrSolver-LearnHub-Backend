// middleware/uploadMiddleware.js
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ✅ Create upload directories (added services & projects)
const uploadDirs = [
  'avatars', 'lectures', 'thumbnails',
  'payments', 'resources', 'certificates',
  'services', 'projects',  // ✅ NEW
];

uploadDirs.forEach((dir) => {
  const dirPath = path.join(__dirname, '..', 'uploads', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// ✅ Storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = path.join(__dirname, '..', 'uploads');

    const fieldRoutes = {
      avatar:        'avatars',
      video:         'lectures',
      lectureFile:   'lectures',
      thumbnail:     'thumbnails',
      screenshot:    'payments',
      paymentProof:  'payments',
      certificate:   'certificates',
      // ✅ NEW: Services & Projects
      serviceImage:  'services',
      projectImage:  'projects',
      image:         'projects',  // for project screenshots
      images:        'projects',  // for multiple screenshots
    };

    const subDir = fieldRoutes[file.fieldname] || 'resources';
    uploadPath = path.join(uploadPath, subDir);
    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    const uniqueSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

// ✅ Allowed MIME types
const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png',
  'image/gif',  'image/webp', 'image/svg+xml',
]);

const VIDEO_MIMES = new Set([
  'video/mp4',       'video/webm',
  'video/quicktime', 'video/x-msvideo',
  'video/x-matroska','video/mpeg',
  'video/ogg',       'video/3gpp',
  'video/x-ms-wmv',
]);

const DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'text/plain',
]);

// ✅ File filter - checks MIME type properly
const fileFilter = (req, file, cb) => {
  const { fieldname, mimetype } = file;

  if (process.env.NODE_ENV !== 'production') {
    console.log(`📁 Upload attempt: field="${fieldname}" mime="${mimetype}" original="${file.originalname}"`);
  }

  // ── Image fields (ADD serviceImage, projectImage, image, images)
  if (['avatar', 'thumbnail', 'screenshot', 'paymentProof', 'serviceImage', 'projectImage', 'image', 'images'].includes(fieldname)) {
    if (IMAGE_MIMES.has(mimetype)) {
      return cb(null, true);
    }
    return cb(new Error(`Only image files allowed for ${fieldname}. Got: ${mimetype}`), false);
  }

  // ── Video field
  if (fieldname === 'video' || fieldname === 'lectureFile') {
    if (VIDEO_MIMES.has(mimetype)) {
      return cb(null, true);
    }
    return cb(
      new Error(
        `Only video files allowed (MP4, WebM, MOV, AVI, MKV). Got: ${mimetype}`
      ),
      false
    );
  }

  // ── Certificate
  if (fieldname === 'certificate') {
    if (mimetype === 'application/pdf') {
      return cb(null, true);
    }
    return cb(new Error('Only PDF files allowed for certificates'), false);
  }

  // ── Resources - images + docs + videos
  if (
    IMAGE_MIMES.has(mimetype) ||
    VIDEO_MIMES.has(mimetype) ||
    DOC_MIMES.has(mimetype)
  ) {
    return cb(null, true);
  }

  return cb(new Error(`File type not allowed: ${mimetype}`), false);
};

// =============================================
// EXISTING UPLOAD INSTANCES
// =============================================

export const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('avatar');

export const uploadThumbnail = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single('thumbnail');

export const uploadVideo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
}).single('video');

export const uploadLectureFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
}).single('lectureFile');

export const uploadPaymentScreenshot = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).fields([
  { name: 'screenshot',            maxCount: 1 },
  { name: 'additionalScreenshots', maxCount: 5 },
]);

export const uploadCertificate = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single('certificate');

export const uploadResources = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
}).array('resources', 10);

// =============================================
// ✅ NEW: SERVICE & PROJECT UPLOADS
// =============================================

// Service thumbnail (single image)
export const uploadServiceImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('serviceImage');

// Project thumbnail (single image)
export const uploadProjectImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('projectImage');

// Project screenshots (multiple images, max 10)
export const uploadProjectImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
}).array('images', 10);

// =============================================
// ✅ MULTER ERROR HANDLER
// =============================================
export const handleMulterError = (err, req, res, next) => {
  if (!err) return next();

  if (process.env.NODE_ENV !== 'production') {
    console.error('📁 Multer error:', err);
  }

  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE:       'File too large. Please check the size limit.',
      LIMIT_FILE_COUNT:      'Too many files uploaded at once.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field name.',
      LIMIT_PART_COUNT:      'Too many form parts.',
      LIMIT_FIELD_KEY:       'Field name too long.',
      LIMIT_FIELD_VALUE:     'Field value too long.',
      LIMIT_FIELD_COUNT:     'Too many fields.',
    };

    return res.status(400).json({
      success: false,
      message: messages[err.code] || err.message || 'File upload error',
    });
  }

  // Custom fileFilter errors
  if (err?.message) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next(err);
};

// =============================================
// ✅ WRAPPER - Makes multer work as proper middleware
// Catches both multer errors AND fileFilter errors
// =============================================
export const wrapMulter = (multerMiddleware) => {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('📁 Upload error:', err.message);
        }

        if (err instanceof multer.MulterError) {
          const messages = {
            LIMIT_FILE_SIZE:  'File too large.',
            LIMIT_FILE_COUNT: 'Too many files.',
          };
          return res.status(400).json({
            success: false,
            message: messages[err.code] || err.message,
          });
        }

        return res.status(400).json({
          success: false,
          message: err.message || 'File upload failed',
        });
      }
      next();
    });
  };
};