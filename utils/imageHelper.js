// utils/imageHelper.js

export const getFullImageUrl = (relativePath) => {
  if (!relativePath) return null;
  
  const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  
  // If it's already a full URL with localhost, extract the path and use production URL
  if (relativePath.includes('localhost')) {
    // Extract path after /uploads/
    const match = relativePath.match(/\/uploads\/(.+)$/);
    if (match) {
      return `${baseUrl}/uploads/${match[1]}`;
    }
  }
  
  // If it's already a correct production URL, return as-is
  if (relativePath.startsWith('https://') && !relativePath.includes('localhost')) {
    return relativePath;
  }
  
  // If it's http:// but not localhost (some other domain), return as-is
  if (relativePath.startsWith('http://') && !relativePath.includes('localhost')) {
    return relativePath;
  }
  
  // Remove leading slash if present
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  
  // Remove 'uploads/' prefix if present (to avoid duplication)
  const finalPath = cleanPath.startsWith('uploads/') ? cleanPath.slice(8) : cleanPath;
  
  return `${baseUrl}/uploads/${finalPath}`;
};