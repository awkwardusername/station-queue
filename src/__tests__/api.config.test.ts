import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getApiBaseUrl,
  getApiConfig,
  getCachedApiConfig,
  clearConfigCache,
  validateApiEndpoint,
  getApiBaseUrlWithFallback,
  EnvironmentDetector
} from '../config/api.config';

// Mock window.location
const mockLocation = (hostname: string, port: string = '') => {
  Object.defineProperty(window, 'location', {
    value: {
      hostname,
      port,
      protocol: 'http:',
      host: port ? `${hostname}:${port}` : hostname
    },
    writable: true
  });
};

// Mock import.meta.env
const mockEnv = (env: Record<string, string>) => {
  Object.defineProperty(import.meta, 'env', {
    value: env,
    writable: true
  });
};

describe('API Configuration', () => {
  beforeEach(() => {
    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('EnvironmentDetector', () => {
    it('should detect local development for localhost', () => {
      mockLocation('localhost');
      expect(EnvironmentDetector.isLocalDevelopment()).toBe(true);
    });

    it('should detect local development for 127.0.0.1', () => {
      mockLocation('127.0.0.1');
      expect(EnvironmentDetector.isLocalDevelopment()).toBe(true);
    });

    it('should detect local development for Vite ports', () => {
      mockLocation('example.com', '5173');
      expect(EnvironmentDetector.isLocalDevelopment()).toBe(true);
    });

    it('should detect local development for common dev ports', () => {
      mockLocation('example.com', '3000');
      expect(EnvironmentDetector.isLocalDevelopment()).toBe(true);
    });

    it('should not detect local development for production domains', () => {
      mockLocation('example.com', '443');
      expect(EnvironmentDetector.isLocalDevelopment()).toBe(false);
    });

    it('should detect staging environment', () => {
      mockLocation('staging.example.com');
      expect(EnvironmentDetector.getCurrentEnvironment()).toBe('staging');
    });

    it('should detect production environment', () => {
      mockLocation('example.com');
      expect(EnvironmentDetector.getCurrentEnvironment()).toBe('production');
    });

    it('should use import.meta.env.MODE when available', () => {
      mockEnv({ MODE: 'staging' });
      expect(EnvironmentDetector.getCurrentEnvironment()).toBe('staging');
    });
  });

  describe('getApiBaseUrl', () => {
    it('should return localhost URL for development', () => {
      mockLocation('localhost');
      mockEnv({});
      expect(getApiBaseUrl()).toBe('http://localhost:5000');
    });

    it('should return Netlify functions URL for production', () => {
      mockLocation('example.com');
      mockEnv({});
      expect(getApiBaseUrl()).toBe('/.netlify/functions/api');
    });

    it('should use VITE_API_URL when provided', () => {
      mockLocation('localhost');
      mockEnv({ VITE_API_URL: 'http://custom-api.com' });
      expect(getApiBaseUrl()).toBe('http://custom-api.com');
    });

    it('should handle errors gracefully', () => {
      // Mock console.error to avoid test output noise
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Force an error by making getCurrentEnvironment throw
      vi.spyOn(EnvironmentDetector, 'getCurrentEnvironment').mockImplementation(() => {
        throw new Error('Test error');
      });

      expect(getApiBaseUrl()).toBe('/.netlify/functions/api');
      expect(consoleError).toHaveBeenCalled();
    });
  });

  describe('getApiConfig', () => {
    it('should return complete configuration', () => {
      mockLocation('localhost');
      mockEnv({});
      
      const config = getApiConfig();
      expect(config).toEqual({
        baseUrl: 'http://localhost:5000',
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000
      });
    });

    it('should use environment variable overrides', () => {
      mockLocation('localhost');
      mockEnv({
        VITE_API_TIMEOUT: '60000',
        VITE_API_RETRY_ATTEMPTS: '5',
        VITE_API_RETRY_DELAY: '2000'
      });
      
      const config = getApiConfig();
      expect(config.timeout).toBe(60000);
      expect(config.retryAttempts).toBe(5);
      expect(config.retryDelay).toBe(2000);
    });
  });

  describe('getCachedApiConfig', () => {
    it('should cache configuration', () => {
      mockLocation('localhost');
      mockEnv({});
      
      const config1 = getCachedApiConfig();
      const config2 = getCachedApiConfig();
      
      expect(config1).toBe(config2); // Same reference
    });

    it('should return new config after cache clear', () => {
      mockLocation('localhost');
      mockEnv({});
      
      const config1 = getCachedApiConfig();
      clearConfigCache();
      const config2 = getCachedApiConfig();
      
      expect(config1).not.toBe(config2); // Different references
      expect(config1).toEqual(config2); // But same values
    });
  });

  describe('validateApiEndpoint', () => {
    it('should validate accessible endpoint', async () => {
      // Mock successful fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const result = await validateApiEndpoint('http://localhost:5000');
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/health',
        expect.objectContaining({
          method: 'HEAD'
        })
      );
    });

    it('should handle failed validation', async () => {
      // Mock failed fetch
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const result = await validateApiEndpoint('http://localhost:5000');
      expect(result).toBe(false);
    });

    it('should handle timeout', async () => {
      // Mock fetch that never resolves
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
      
      const result = await validateApiEndpoint('http://localhost:5000');
      expect(result).toBe(false);
    }, 6000); // Increase test timeout
  });

  describe('getApiBaseUrlWithFallback', () => {
    it('should return primary URL in production', async () => {
      mockLocation('example.com');
      mockEnv({});
      
      const url = await getApiBaseUrlWithFallback();
      expect(url).toBe('/.netlify/functions/api');
    });

    it('should validate and use primary URL in development', async () => {
      mockLocation('localhost');
      mockEnv({});
      
      // Mock successful validation
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
      
      const url = await getApiBaseUrlWithFallback();
      expect(url).toBe('http://localhost:5000');
    });

    it('should fallback when primary URL fails', async () => {
      mockLocation('localhost', '3001');
      mockEnv({});
      
      // Mock fetch to fail for first URL, succeed for second
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({ ok: true });
      });
      
      const url = await getApiBaseUrlWithFallback();
      expect(url).toBe('http://localhost:5000');
    });

    it('should return primary URL when all validations fail', async () => {
      mockLocation('localhost');
      mockEnv({});
      
      // Mock all validations to fail
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      
      const url = await getApiBaseUrlWithFallback();
      expect(url).toBe('http://localhost:5000');
    });
  });
});