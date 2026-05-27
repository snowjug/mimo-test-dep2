import axios from "axios";

// Always use Firebase Functions - the VITE_API_URL env var was pointing to old dead Northflank backend
const API_URL = "https://api-upqxuj7evq-uc.a.run.app";

const api = axios.create({
  baseURL: API_URL,
});

// Add a request interceptor to include the JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("jwtToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
