// utils/imageHelper.js

export const getFullImageUrl = (imagePath) => {
  // Return null for empty values
  if (!imagePath || imagePath === '' || imagePath === 'null' || imagePath === 'undefined') {
    return null;
  }

  // Convert to string
  const path = String(imagePath);

  // Get backend URL from environment
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  
  // If it's already a full production URL, return as-is
  if (path.startsWith(backendUrl)) {
    return path;
  }

  // If it's a localhost URL, extract relative path
  if (path.includes('localhost') || path.includes('127.0.0.1')) {
    const uploadsIndex = path.indexOf('/uploads/');
    if (uploadsIndex !== -1) {
      const relativePath = path.substring(uploadsIndex + 9);
      return `${backendUrl}/uploads/${relativePath}`;
    }
  }

  // If it's an external URL (cloudinary, s3, etc.), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Handle relative paths
  let cleanPath = path;
  
  // Remove leading slash
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.slice(1);
  }
  
  // Remove 'uploads/' prefix if present
  if (cleanPath.startsWith('uploads/')) {
    cleanPath = cleanPath.slice(8);
  }

  return `${backendUrl}/uploads/${cleanPath}`;
};

export default { getFullImageUrl };