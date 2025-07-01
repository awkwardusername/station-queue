import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { initAbly } from './ablyUtils';

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

// --- UserId persistence logic ---
function getOrSetUserId() {
  let userId = localStorage.getItem('userId');
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem('userId', userId);
    
    // Initialize Ably with the new userId
    initAbly(userId);
  }
  return userId || '';
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  withCredentials: true,
});

// Add userId to every request as a header
api.interceptors.request.use(config => {
  const userId = getOrSetUserId();
  config.headers = config.headers || {};
  config.headers['x-user-id'] = userId;
  return config;
});

export default api;