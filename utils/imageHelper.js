// utils/imageHelper.js

/**
 * Get the full URL for uploaded files
 * @param {string} relativePath - The relative path stored in database
 * @returns {string} - Full URL to the file
 */
export const getFullImageUrl = (relativePath) => {
  if (!relativePath) return null;
  
  // If already a full URL, return as is
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  
  const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  
  // Remove leading slash if present
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  
  return `${baseUrl}/uploads/${cleanPath}`;
};

/**
 * Get relative path from full URL (for storing in database)
 * @param {string} fullUrl - The full URL
 * @returns {string} - Relative path
 */
export const getRelativePath = (fullUrl) => {
  if (!fullUrl) return null;
  
  // If already relative, return as is
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    return fullUrl;
  }
  
  // Extract path after /uploads/
  const match = fullUrl.match(/\/uploads\/(.+)$/);
  return match ? match[1] : fullUrl;
};

/**
 * Transform object to include full image URLs
 * @param {Object} obj - Object with image fields
 * @param {Array} imageFields - Array of field names that contain image paths
 * @returns {Object} - Object with full URLs
 */
export const transformImageUrls = (obj, imageFields = []) => {
  if (!obj) return obj;
  
  const transformed = { ...obj };
  
  imageFields.forEach(field => {
    if (transformed[field]) {
      transformed[field] = getFullImageUrl(transformed[field]);
    }
  });
  
  return transformed;
};