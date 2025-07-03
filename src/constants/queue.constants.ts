export const NOTIFICATION_ICONS = {
  removed: '❌',
  position: '🔢',
  error: '⚠️',
  default: '🔔',
} as const;

export const NOTIFICATION_SOUND = {
  frequency: 1200,
  gain: 0.08,
  duration: 0.18,
} as const;

export const MAX_NOTIFICATIONS = 10;

export const STORAGE_KEYS = {
  userId: 'userId',
  notifications: 'queueNotifications',
} as const;

export const UI_CONSTANTS = {
  notificationBlurTimeout: 200,
  ablyRetryDelay: 5000,
} as const;