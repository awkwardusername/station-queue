/**
 * API Configuration Module
 * Centralizes all API-related configuration and environment detection
 */

import type { ApiConfig, Environment } from '../types/config.types';

/**
 * Environment detection utilities
 */
export const EnvironmentDetector = {
  /**
   * Checks if the application is running in a local development environment
   */
  isLocalDevelopment(): boolean {
    const { hostname, port } = window.location;
    
    // Check for common local development indicators
    const localHostnames = ['localhost', '127.0.0.1', '0.0.0.0'];
    const isLocalHostname = localHostnames.includes(hostname);
    
    // Check for Vite development server ports (5173-5179)
    const isVitePort = /^517\d$/.test(port);
    
    // Check for common development ports
    const devPorts = ['3000', '3001', '4200', '5000', '5173', '8080', '8000'];
    const isDevPort = devPorts.includes(port);
    
    return isLocalHostname || isVitePort || isDevPort;
  },

  /**
   * Detects the current environment based on various indicators
   */
  getCurrentEnvironment(): Environment {
    // Check for environment variable (Vite exposes import.meta.env)
    if (import.meta?.env?.MODE) {
      return import.meta.env.MODE as Environment;
    }
    
    // Fallback to hostname-based detection
    if (this.isLocalDevelopment()) {
      return 'development';
    }
    
    // Check for staging indicators in the hostname
    if (window.location.hostname.includes('staging') || 
        window.location.hostname.includes('stage')) {
      return 'staging';
    }
    
    return 'production';
  }
};

/**
 * API endpoint configurations for different environments
 */
const API_ENDPOINTS: Record<Environment, string> = {
  development: import.meta.env?.VITE_API_URL ?? 'http://localhost:5000',
  staging: import.meta.env?.VITE_API_URL ?? '/.netlify/functions/api',
  production: import.meta.env?.VITE_API_URL ?? '/.netlify/functions/api'
};

/**
 * Default configuration values with environment variable overrides
 */
const DEFAULT_CONFIG = {
  timeout: import.meta.env?.VITE_API_TIMEOUT
    ? parseInt(import.meta.env.VITE_API_TIMEOUT, 10)
    : 30000, // 30 seconds
  retryAttempts: import.meta.env?.VITE_API_RETRY_ATTEMPTS
    ? parseInt(import.meta.env.VITE_API_RETRY_ATTEMPTS, 10)
    : 3,
  retryDelay: import.meta.env?.VITE_API_RETRY_DELAY
    ? parseInt(import.meta.env.VITE_API_RETRY_DELAY, 10)
    : 1000 // 1 second
};

/**
 * Gets the API base URL based on the current environment
 * @returns The appropriate API base URL
 */
export function getApiBaseUrl(): string {
  try {
    const environment = EnvironmentDetector.getCurrentEnvironment();
    const baseUrl = API_ENDPOINTS[environment];
    
    if (!baseUrl) {
      console.warn(`No API endpoint configured for environment: ${environment}`);
      return API_ENDPOINTS.production; // Fallback to production
    }
    
    return baseUrl;
  } catch (error) {
    console.error('Error determining API base URL:', error);
    // Fallback to production endpoint on error
    return API_ENDPOINTS.production;
  }
}

/**
 * Gets the complete API configuration
 * @returns API configuration object
 */
export function getApiConfig(): ApiConfig {
  return {
    baseUrl: getApiBaseUrl(),
    ...DEFAULT_CONFIG
  };
}

/**
 * Validates if a URL is accessible (useful for health checks)
 * @param url - The URL to validate
 * @returns Promise resolving to boolean indicating if URL is accessible
 */
export async function validateApiEndpoint(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${url}/health`, {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.warn(`API endpoint validation failed for ${url}:`, error);
    return false;
  }
}

/**
 * Gets the API base URL with automatic fallback on failure
 * @returns Promise resolving to the working API base URL
 */
export async function getApiBaseUrlWithFallback(): Promise<string> {
  const primaryUrl = getApiBaseUrl();
  
  // In production, don't validate (assume it works)
  if (EnvironmentDetector.getCurrentEnvironment() === 'production') {
    return primaryUrl;
  }
  
  // Validate the primary URL
  const isPrimaryValid = await validateApiEndpoint(primaryUrl);
  if (isPrimaryValid) {
    return primaryUrl;
  }
  
  // Try fallback URLs
  const fallbackUrls = [
    'http://localhost:5000',
    'http://localhost:3000',
    '/.netlify/functions/api'
  ].filter(url => url !== primaryUrl);
  
  for (const fallbackUrl of fallbackUrls) {
    const isValid = await validateApiEndpoint(fallbackUrl);
    if (isValid) {
      console.warn(`Primary API URL failed, using fallback: ${fallbackUrl}`);
      return fallbackUrl;
    }
  }
  
  // If all fail, return the primary URL anyway
  console.error('All API endpoints failed validation, using primary URL');
  return primaryUrl;
}

/**
 * Configuration cache to avoid repeated environment detection
 */
let cachedConfig: ApiConfig | null = null;

/**
 * Gets the cached API configuration or creates a new one
 * @returns Cached API configuration
 */
export function getCachedApiConfig(): ApiConfig {
  cachedConfig ??= getApiConfig();
  return cachedConfig;
}

/**
 * Clears the configuration cache (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

// Export for backward compatibility
export default {
  getApiBaseUrl,
  getApiConfig,
  getCachedApiConfig,
  validateApiEndpoint,
  getApiBaseUrlWithFallback,
  clearConfigCache,
  EnvironmentDetector
};