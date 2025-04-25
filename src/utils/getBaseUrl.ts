/**
 * Utility function to get the base URL for API calls
 */
export function getBaseUrl() {
  var baseUrl = process.env.VERCEL_URL 
  || process.env.NEXTAUTH_URL 
  || process.env.NEXT_PUBLIC_BASE_URL 
  || `http://localhost:${process.env.PORT ?? 3000}`;
  // console.log("BaseUrl", baseUrl);
  return baseUrl;
} 