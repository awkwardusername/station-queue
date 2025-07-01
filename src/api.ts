import axios from 'axios';

function getApiBaseUrl() {
  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.port === '5173'
  ) {
    return 'http://localhost:5000';
  }
  return '/.netlify/functions/api';
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
});

export default api;