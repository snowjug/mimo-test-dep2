import axios from 'axios';

const API_URL = 'https://api-upqxuj7evq-uc.a.run.app';

const api = axios.create({
  baseURL: API_URL,
});

export default api;
