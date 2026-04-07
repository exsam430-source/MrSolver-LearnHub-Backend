// utils/imageHelper.js

export const getFullImageUrl = (path) => {
  if (!path) return null;
  
  const BACKEND_URL = process.env.BACKEND_URL || 'https://mrsolver-learnhub-backend-production.up.railway.app';
  
  // Already correct production URL
  if (path.startsWith(BACKEND_URL)) {
    return path;
  }
  
  // Handle localhost URLs - extract path and use production URL
  if (path.includes('localhost:5000') || path.includes('localhost:3000')) {
    const match = path.match(/\/uploads\/(.+)$/);
    if (match) {
      return `${BACKEND_URL}/uploads/${match[1]}`;
    }
  }
  
  // Handle other http/https URLs (external images)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    // If it's localhost, fix it
    if (path.includes('localhost')) {
      const match = path.match(/\/uploads\/(.+)$/);
      if (match) {
        return `${BACKEND_URL}/uploads/${match[1]}`;
      }
    }
    return path;
  }
  
  // Handle relative paths (e.g., "avatars/image.jpg" or "/uploads/avatars/image.jpg")
  let cleanPath = path;
  
  // Remove leading slash
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.slice(1);
  }
  
  // Remove "uploads/" prefix if present
  if (cleanPath.startsWith('uploads/')) {
    cleanPath = cleanPath.slice(8);
  }
  
  return `${BACKEND_URL}/uploads/${cleanPath}`;
};