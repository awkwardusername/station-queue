// src/__tests__/UserQueue.test.tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import UserQueue from '../UserQueue';
import type { Station, QueueItem } from '../types/queue.types';

// Mock external modules
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  }
}));

vi.mock('../ablyUtils', () => ({
  initAbly: vi.fn(),
  subscribeToMyQueueUpdates: vi.fn(),
  subscribeToChannel: vi.fn(),
  CHANNEL_NAMES: {
    QUEUE: (stationId: string) => `queue:${stationId}`,
    STATIONS: 'stations',
    MY_QUEUES: (userId: string) => `my-queues:${userId}`,
  },
  EVENT_NAMES: {
    QUEUE_UPDATE: 'queue:update',
    QUEUE_POP: 'queue:pop',
    STATION_UPDATE: 'station:update',
    STATION_CREATE: 'station:create',
    STATION_DELETE: 'station:delete',
  },
  addConnectionStateListener: vi.fn(),
  removeConnectionStateListener: vi.fn(),
}));

vi.mock('../fallbackPolling', () => ({
  createMyQueuesPoller: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    isActive: vi.fn(() => false),
  })),
  createStationsPoller: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    isActive: vi.fn(() => false),
  })),
  POLLING_INTERVALS: {
    FAST: 2000,
    NORMAL: 5000,
  },
}));

vi.mock('../hooks/useNotificationSound', () => ({
  useNotificationSound: vi.fn(() => ({
    playSound: vi.fn(),
  })),
}));

vi.mock('../hooks/useNotifications', () => ({
  useNotifications: vi.fn(() => ({
    notifications: [],
    showDropdown: false,
    bellAnimate: false,
    setBellAnimate: vi.fn(),
    addNotifications: vi.fn(),
    clearNotifications: vi.fn(),
    toggleDropdown: vi.fn(),
    hideDropdown: vi.fn(),
  })),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-user-id-123'),
}));

vi.mock('../utils/queueUtils', () => ({
  generateNotifications: vi.fn(() => []),
  validateQueueData: vi.fn((data) => Array.isArray(data)),
  getNotificationIcon: vi.fn(() => '🔔'),
  calculateActualPosition: vi.fn((num) => num),
}));

vi.mock('../config/api.config', () => ({
  getApiConfig: vi.fn(() => ({
    baseUrl: 'http://localhost:5000',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  })),
  getApiBaseUrl: vi.fn(() => 'http://localhost:5000'),
}));

// Import mocked modules
import api from '../api';
import * as ablyUtils from '../ablyUtils';
import { useNotifications } from '../hooks/useNotifications';

// Test data
const mockStations: Station[] = [
  { id: 'station-1', name: 'Station 1' },
  { id: 'station-2', name: 'Station 2' },
];

const mockQueues: QueueItem[] = [
  { stationId: 'station-1', stationName: 'Station 1', queueNumber: 101 },
  { stationId: 'station-2', stationName: 'Station 2', queueNumber: 102 },
];

describe('UserQueue', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    window.localStorage.clear();
    user = userEvent.setup();

    // Setup notification hook mock
    const mockNotificationHelpers = {
      notifications: [],
      showDropdown: false,
      bellAnimate: false,
      setBellAnimate: vi.fn(),
      addNotifications: vi.fn(),
      clearNotifications: vi.fn(),
      toggleDropdown: vi.fn(),
      hideDropdown: vi.fn(),
    };
    (useNotifications as Mock).mockReturnValue(mockNotificationHelpers);

    // Default API responses
    (api.get as Mock).mockImplementation((url: string) => {
      if (url === '/stations') {
        return Promise.resolve({ data: mockStations });
      }
      if (url === '/my-queues') {
        return Promise.resolve({ data: [] });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    // Default Ably mock behavior - return proper unsubscribe functions
    (ablyUtils.initAbly as Mock).mockResolvedValue({ connection: { state: 'connected' } });
    
    // Create a stable unsubscribe function
    const unsubscribeFn = vi.fn();
    (ablyUtils.subscribeToMyQueueUpdates as Mock).mockImplementation(() => 
      Promise.resolve(unsubscribeFn)
    );
    (ablyUtils.subscribeToChannel as Mock).mockImplementation(() => 
      Promise.resolve(unsubscribeFn)
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  describe('Component Rendering', () => {
    it('renders the main heading', () => {
      render(<UserQueue />);
      expect(screen.getByText('Queue for a Station')).toBeInTheDocument();
    });

    it('renders the station select dropdown', () => {
      render(<UserQueue />);
      expect(screen.getByLabelText(/Select a station/i)).toBeInTheDocument();
    });

    it('renders the join queue button', () => {
      render(<UserQueue />);
      expect(screen.getByRole('button', { name: /join queue/i })).toBeInTheDocument();
    });

    it('renders the my queues section', () => {
      render(<UserQueue />);
      expect(screen.getByText('My Queues')).toBeInTheDocument();
    });

    it('renders the notification bell', () => {
      render(<UserQueue />);
      expect(screen.getByLabelText(/Notifications/i)).toBeInTheDocument();
    });
  });

  describe('User ID Management', () => {
    it('generates and stores user ID on first render', async () => {
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(localStorage.getItem('userId')).toBe('test-user-id-123');
      });
    });

    it('uses existing user ID from localStorage', async () => {
      localStorage.setItem('userId', 'existing-user-id');
      
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(localStorage.getItem('userId')).toBe('existing-user-id');
      });
    });
  });

  describe('API Integration', () => {
    it('fetches stations on mount', async () => {
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stations');
      });
    });

    it('fetches user queues on mount', async () => {
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/my-queues');
      });
    });

    it('displays fetched stations in dropdown', async () => {
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(screen.getByText('Station 1')).toBeInTheDocument();
        expect(screen.getByText('Station 2')).toBeInTheDocument();
      });
    });
  });

  describe('Queue Joining', () => {
    it('disables join button when no station is selected', () => {
      render(<UserQueue />);
      
      const button = screen.getByRole('button', { name: /join queue/i });
      expect(button).toBeDisabled();
    });

    it('enables join button when station is selected', async () => {
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(screen.getByText('Station 1')).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/Select a station/i);
      await user.selectOptions(select, 'station-1');
      
      const button = screen.getByRole('button', { name: /join queue/i });
      expect(button).toBeEnabled();
    });

    it('calls API to join queue when button is clicked', async () => {
      (api.post as Mock).mockResolvedValueOnce({ data: { queueNumber: 103 } });
      
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(screen.getByText('Station 1')).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/Select a station/i);
      await user.selectOptions(select, 'station-1');
      
      const button = screen.getByRole('button', { name: /join queue/i });
      await user.click(button);
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/queue/station-1');
      });
    });

    it('shows loading state while joining queue', async () => {
      (api.post as Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: { queueNumber: 103 } }), 100))
      );
      
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(screen.getByText('Station 1')).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/Select a station/i);
      await user.selectOptions(select, 'station-1');
      
      const button = screen.getByRole('button', { name: /join queue/i });
      await user.click(button);
      
      expect(screen.getByText('Joining...')).toBeInTheDocument();
    });
  });

  describe('Queue Display', () => {
    it('shows empty state when user has no queues', async () => {
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(screen.getByText(/You are not in any queues/i)).toBeInTheDocument();
      });
    });

    it('displays user queues in table', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/stations') return Promise.resolve({ data: mockStations });
        if (url === '/my-queues') return Promise.resolve({ data: mockQueues });
        return Promise.reject(new Error('Unknown endpoint'));
      });
      
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(screen.getByText('101')).toBeInTheDocument();
        expect(screen.getByText('102')).toBeInTheDocument();
      });
    });

    it('shows queue number alert when station is selected', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/stations') return Promise.resolve({ data: mockStations });
        if (url === '/my-queues') return Promise.resolve({ data: mockQueues });
        return Promise.reject(new Error('Unknown endpoint'));
      });
      
      render(<UserQueue />);
      
      await waitFor(() => {
        // Use getAllByText since 'Station 1' appears in both dropdown and table
        expect(screen.getAllByText('Station 1').length).toBeGreaterThan(0);
      });

      const select = screen.getByLabelText(/Select a station/i);
      await user.selectOptions(select, 'station-1');
      
      await waitFor(() => {
        expect(screen.getByText(/Your queue number for/)).toBeInTheDocument();
        // The queue number is displayed as "# 101" in the alert
        const alert = screen.getByText(/Your queue number for/).closest('.alert');
        expect(alert).toHaveTextContent('101');
      });
    });
  });

  describe('Notifications', () => {
    it('toggles notification dropdown when bell is clicked', async () => {
      const mockHelpers = {
        notifications: [],
        showDropdown: false,
        bellAnimate: false,
        setBellAnimate: vi.fn(),
        addNotifications: vi.fn(),
        clearNotifications: vi.fn(),
        toggleDropdown: vi.fn(),
        hideDropdown: vi.fn(),
      };
      (useNotifications as Mock).mockReturnValue(mockHelpers);
      
      render(<UserQueue />);
      
      const bell = screen.getByLabelText(/Notifications/i);
      await user.click(bell);
      
      expect(mockHelpers.toggleDropdown).toHaveBeenCalled();
    });

    it('shows notification count badge', () => {
      (useNotifications as Mock).mockReturnValue({
        notifications: [
          { msg: 'Test', ts: Date.now(), type: 'position', station: 'Station 1' }
        ],
        showDropdown: false,
        bellAnimate: false,
        setBellAnimate: vi.fn(),
        addNotifications: vi.fn(),
        clearNotifications: vi.fn(),
        toggleDropdown: vi.fn(),
        hideDropdown: vi.fn(),
      });
      
      render(<UserQueue />);
      
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('initializes Ably connection', async () => {
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(ablyUtils.initAbly).toHaveBeenCalledWith('test-user-id-123');
      });
    });

    it('subscribes to real-time channels', async () => {
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(ablyUtils.subscribeToMyQueueUpdates).toHaveBeenCalledWith(
          'test-user-id-123',
          expect.any(Function)
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('handles station fetch error gracefully', async () => {
      const mockHelpers = {
        notifications: [],
        showDropdown: false,
        bellAnimate: false,
        setBellAnimate: vi.fn(),
        addNotifications: vi.fn(),
        clearNotifications: vi.fn(),
        toggleDropdown: vi.fn(),
        hideDropdown: vi.fn(),
      };
      (useNotifications as Mock).mockReturnValue(mockHelpers);
      
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/stations') {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ data: [] });
      });
      
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(mockHelpers.addNotifications).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'error',
              msg: expect.stringContaining('Failed to load stations'),
            })
          ])
        );
      });
    });

    it('handles join queue error gracefully', async () => {
      const mockHelpers = {
        notifications: [],
        showDropdown: false,
        bellAnimate: false,
        setBellAnimate: vi.fn(),
        addNotifications: vi.fn(),
        clearNotifications: vi.fn(),
        toggleDropdown: vi.fn(),
        hideDropdown: vi.fn(),
      };
      (useNotifications as Mock).mockReturnValue(mockHelpers);
      
      const errorResponse = {
        response: {
          data: { error: 'Queue is full' }
        }
      };
      (api.post as Mock).mockRejectedValueOnce(errorResponse);
      
      render(<UserQueue />);
      
      await waitFor(() => {
        expect(screen.getByText('Station 1')).toBeInTheDocument();
      });

      const select = screen.getByLabelText(/Select a station/i);
      await user.selectOptions(select, 'station-1');
      
      const button = screen.getByRole('button', { name: /join queue/i });
      await user.click(button);
      
      await waitFor(() => {
        expect(mockHelpers.addNotifications).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'error',
              msg: expect.stringContaining('Queue is full'),
            })
          ])
        );
      });
    });
  });
});