// utils/imageHelper.js - BACKEND
export const getFullImageUrl = (imagePath) => {
  if (!imagePath ||
      imagePath === '' ||
      imagePath === 'null' ||
      imagePath === 'undefined') {
    return null;
  }

  const path = String(imagePath);
  const backendUrl = process.env.BACKEND_URL ||
    `http://localhost:${process.env.PORT || 5000}`;

  // Already a full URL
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Remove leading slash
  let cleanPath = path.startsWith('/')
    ? path.slice(1)
    : path;

  // Remove 'uploads/' prefix if present
  if (cleanPath.startsWith('uploads/')) {
    cleanPath = cleanPath.slice(8);
  }

  // ✅ Build correct URL
  return `${backendUrl}/uploads/${cleanPath}`;
};

export default { getFullImageUrl };