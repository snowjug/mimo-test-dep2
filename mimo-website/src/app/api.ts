import axios from "axios";

// Always use Firebase Functions - the VITE_API_URL env var was pointing to old dead Northflank backend
const API_URL = "https://api-upqxuj7evq-uc.a.run.app";

const api = axios.create({
  baseURL: API_URL,
});

// Add a request interceptor to include the JWT token
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem("jwtToken") || localStorage.getItem("jwtToken");
    // Only inject user token if no custom auth header (like Admin token) was provided
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auto-logout user on authentication errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Avoid redirect loops if they are already on the login page
      if (window.location.pathname !== '/' && window.location.pathname !== '/login' && !window.location.pathname.startsWith('/admin')) {
        localStorage.removeItem('jwtToken');
        sessionStorage.removeItem('jwtToken');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
