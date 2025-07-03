/**
 * Configuration type definitions
 */

/**
 * Environment types
 */
export type Environment = 'development' | 'staging' | 'production';

/**
 * API configuration interface
 */
export interface ApiConfig {
  /** Base URL for API requests */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts for failed requests */
  retryAttempts?: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
}

/**
 * Vite environment variables interface
 * Add your custom environment variables here
 */
export interface ImportMetaEnv {
  /** API base URL override */
  readonly VITE_API_URL?: string;
  /** Application mode */
  readonly VITE_MODE?: Environment;
  /** Enable debug mode */
  readonly VITE_ENABLE_DEBUG?: string;
  /** Enable analytics */
  readonly VITE_ENABLE_ANALYTICS?: string;
  /** API timeout override */
  readonly VITE_API_TIMEOUT?: string;
  /** API retry attempts override */
  readonly VITE_API_RETRY_ATTEMPTS?: string;
  /** API retry delay override */
  readonly VITE_API_RETRY_DELAY?: string;
  /** Default Vite environment variables */
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly SSR: boolean;
}

/**
 * Extend ImportMeta interface
 */
export interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Window location extension for better type safety
 */
export interface ExtendedLocation extends Location {
  /** Parsed port as number */
  readonly portNumber?: number;
}

/**
 * API Error response structure
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp?: string;
  path?: string;
}

/**
 * API Success response wrapper
 */
export interface ApiSuccessResponse<T = unknown> {
  data: T;
  message?: string;
  timestamp?: string;
}