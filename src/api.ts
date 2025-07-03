import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { initAbly } from './ablyUtils';
import { getApiConfig } from './config/api.config';

// --- UserId persistence logic ---
let userIdCache: string | null = null;

function getOrSetUserId() {
  // Return cached value if available
  if (userIdCache) {
    return userIdCache;
  }

  try {
    let userId = localStorage.getItem('userId');
    if (!userId) {
      userId = uuidv4();
      try {
        localStorage.setItem('userId', userId);
      } catch (storageError) {
        console.warn('Failed to persist userId to localStorage:', storageError);
        // Continue with the generated userId even if we can't persist it
      }
      
      // Initialize Ably with the new userId in background
      // Using void to ignore the Promise
      void (async () => {
        try {
          await initAbly(userId);
        } catch (error) {
          console.error('Error initializing Ably:', error);
        }
      })();
    }
    userIdCache = userId;
    return userId;
  } catch (error) {
    console.error('Error accessing localStorage:', error);
    // Fallback: use a session-based userId if localStorage fails
    userIdCache ??= uuidv4();
    return userIdCache;
  }
}

// Get API configuration
const apiConfig = getApiConfig();

const api = axios.create({
  baseURL: apiConfig.baseUrl,
  timeout: apiConfig.timeout,
  withCredentials: true,
});

// Add retry logic interceptor
api.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;
    
    // Check if we should retry
    config.retryCount ??= 0;
    
    if (config.retryCount >= (apiConfig.retryAttempts ?? 3)) {
      // Extract the nested ternary into separate statements
      let errorToReject;
      if (error instanceof Error) {
        errorToReject = error;
      } else {
        const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
        errorToReject = new Error(errorMessage);
      }
      return Promise.reject(errorToReject);
    }
    
    // Increment retry count
    config.retryCount += 1;
    
    // Wait before retrying (exponential backoff)
    const delay = (apiConfig.retryDelay ?? 1000) * Math.pow(2, config.retryCount - 1);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry the request
    return api(config);
  }
);

// Add userId to every request as a header
api.interceptors.request.use(
  config => {
    try {
      const userId = getOrSetUserId();
      config.headers = config.headers ?? {};
      config.headers['x-user-id'] = userId;
      return config;
    } catch (error) {
      console.error('Error in request interceptor:', error);
      // Return config anyway to not break the request
      return config;
    }
  },
  error => {
    // Handle request errors - ensure error is an Error object
    let errorToReject;
    if (error instanceof Error) {
      errorToReject = error;
    } else {
      const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
      errorToReject = new Error(errorMessage);
    }
    return Promise.reject(errorToReject);
  }
);

export default api;