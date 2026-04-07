import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create upload directories if they don't exist
const uploadDirs = ['avatars', 'lectures', 'thumbnails', 'payments', 'resources', 'certificates'];
uploadDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', 'uploads', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = path.join(__dirname, '..', 'uploads');

    if (file.fieldname === 'avatar') {
      uploadPath = path.join(uploadPath, 'avatars');
    } else if (file.fieldname === 'video' || file.fieldname === 'lectureFile') {
      uploadPath = path.join(uploadPath, 'lectures');
    } else if (file.fieldname === 'thumbnail') {
      uploadPath = path.join(uploadPath, 'thumbnails');
    } else if (file.fieldname === 'screenshot' || file.fieldname === 'paymentProof') {
      uploadPath = path.join(uploadPath, 'payments');
    } else if (file.fieldname === 'certificate') {
      uploadPath = path.join(uploadPath, 'certificates');
    } else {
      uploadPath = path.join(uploadPath, 'resources');
    }

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
  const allowedVideoTypes = /mp4|webm|mov|avi|mkv/;
  const allowedDocTypes = /pdf|doc|docx|ppt|pptx|xls|xlsx|txt|zip|rar/;

  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  const mimetype = file.mimetype;

  if (file.fieldname === 'avatar' || file.fieldname === 'thumbnail' || file.fieldname === 'screenshot' || file.fieldname === 'paymentProof') {
    if (allowedImageTypes.test(ext) && /image/.test(mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  } else if (file.fieldname === 'video') {
    if (allowedVideoTypes.test(ext) && /video/.test(mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed!'), false);
    }
  } else {
    // Allow all common file types for resources
    if (allowedImageTypes.test(ext) || allowedVideoTypes.test(ext) || allowedDocTypes.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed!'), false);
    }
  }
};

// Upload configurations
export const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).single('avatar');

export const uploadThumbnail = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).single('thumbnail');

export const uploadVideo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
}).single('video');

export const uploadLectureFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
}).single('lectureFile');

export const uploadPaymentScreenshot = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).fields([
  { name: 'screenshot', maxCount: 1 },
  { name: 'additionalScreenshots', maxCount: 5 }
]);
export const uploadCertificate = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (ext === 'pdf' || /pdf/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for certificates!'), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).single('certificate');

export const uploadResources = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
}).array('resources', 10);

// Error handling middleware for multer
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File size too large' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files' });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};