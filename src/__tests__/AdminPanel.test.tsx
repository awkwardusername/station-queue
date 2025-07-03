// src/__tests__/AdminPanel.test.tsx
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import AdminPanel from '../AdminPanel';

// Mock external modules
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  }
}));

vi.mock('../ablyUtils', () => ({
  initAbly: vi.fn(),
  subscribeToChannel: vi.fn(),
  CHANNEL_NAMES: {
    STATIONS: 'stations',
    QUEUE: (stationId: string) => `queue:${stationId}`,
    MY_QUEUES: (userId: string) => `my-queues:${userId}`,
  },
  EVENT_NAMES: {
    QUEUE_UPDATE: 'queue:update',
    QUEUE_POP: 'queue:pop',
    STATION_UPDATE: 'station:update',
    STATION_CREATE: 'station:create',
    STATION_DELETE: 'station:delete',
  },
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

// Test data
const mockStations = [
  { id: '1', name: 'Test Station', managerId: 'mgr-1' },
  { id: '2', name: 'Another Station', managerId: 'mgr-2' },
];

describe('AdminPanel', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    window.localStorage.clear();
    user = userEvent.setup();

    // Mock window.confirm for delete operations
    window.confirm = vi.fn(() => true);

    // Default API responses
    (api.get as Mock).mockImplementation((url: string) => {
      if (url === '/stations') {
        return Promise.resolve({ data: mockStations });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    (api.post as Mock).mockResolvedValue({
      data: { id: 'new-id', name: 'New Station', managerId: 'new-mgr' }
    });

    (api.delete as Mock).mockResolvedValue({ data: { success: true } });

    // Default Ably mock behavior
    (ablyUtils.initAbly as Mock).mockResolvedValue({ connection: { state: 'connected' } });
    
    const unsubscribeFn = vi.fn();
    (ablyUtils.subscribeToChannel as Mock).mockResolvedValue(unsubscribeFn);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('renders login form when not authenticated', () => {
      render(<AdminPanel />);
      
      expect(screen.getByText(/Admin Login/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Admin Secret/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Unlock Admin/i })).toBeInTheDocument();
    });

    it('authenticates with valid secret', async () => {
      render(<AdminPanel />);
      
      const secretInput = screen.getByPlaceholderText(/Admin Secret/i);
      const loginButton = screen.getByRole('button', { name: /Unlock Admin/i });
      
      await user.type(secretInput, 'test-secret');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stations', {
          headers: { 'x-admin-secret': 'test-secret' }
        });
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
    });

    it('shows error with invalid secret', async () => {
      (api.get as Mock).mockRejectedValueOnce(new Error('Forbidden'));
      
      render(<AdminPanel />);
      
      const secretInput = screen.getByPlaceholderText(/Admin Secret/i);
      const loginButton = screen.getByRole('button', { name: /Unlock Admin/i });
      
      await user.type(secretInput, 'wrong-secret');
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(screen.getByText(/Invalid admin secret/i)).toBeInTheDocument();
      });
    });

    it('auto-authenticates with saved secret', async () => {
      localStorage.setItem('adminSecret', 'saved-secret');
      
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stations', {
          headers: { 'x-admin-secret': 'saved-secret' }
        });
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
    });

    it('clears saved secret on failed auto-authentication', async () => {
      localStorage.setItem('adminSecret', 'invalid-saved-secret');
      (api.get as Mock).mockRejectedValueOnce(new Error('Forbidden'));
      
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(localStorage.getItem('adminSecret')).toBeNull();
        expect(screen.getByText(/Admin Login/i)).toBeInTheDocument();
      });
    });

    it('handles logout correctly', async () => {
      localStorage.setItem('adminSecret', 'saved-secret');
      
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
      
      const logoutButton = screen.getByRole('button', { name: /Logout/i });
      await user.click(logoutButton);
      
      expect(localStorage.getItem('adminSecret')).toBeNull();
      expect(screen.getByText(/Admin Login/i)).toBeInTheDocument();
    });
  });

  describe('Station Management', () => {
    beforeEach(() => {
      // Auto-authenticate for these tests
      localStorage.setItem('adminSecret', 'test-secret');
    });

    it('displays stations table', async () => {
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Stations/i)).toBeInTheDocument();
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(screen.getByText('Test Station')).toBeInTheDocument();
        expect(screen.getByText('Another Station')).toBeInTheDocument();
      });
    });

    it('creates a new station', async () => {
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
      
      const nameInput = screen.getByPlaceholderText(/Station Name/i);
      const createButton = screen.getByRole('button', { name: /Create Station/i });
      
      await user.type(nameInput, 'New Station');
      await user.click(createButton);
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/stations',
          { name: 'New Station' },
          { headers: { 'x-admin-secret': 'test-secret' } }
        );
        expect(screen.getByText(/Station created!/i)).toBeInTheDocument();
      });
    });

    it('prevents creating station with empty name', async () => {
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
      
      const createButton = screen.getByRole('button', { name: /Create Station/i });
      expect(createButton).toBeDisabled();
    });

    it('trims whitespace from station name', async () => {
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
      
      const nameInput = screen.getByPlaceholderText(/Station Name/i);
      const createButton = screen.getByRole('button', { name: /Create Station/i });
      
      await user.type(nameInput, '  Trimmed Station  ');
      await user.click(createButton);
      
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          '/admin/stations',
          { name: 'Trimmed Station' },
          { headers: { 'x-admin-secret': 'test-secret' } }
        );
      });
    });

    it('deletes a station with confirmation', async () => {
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText('Test Station')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
      await user.click(deleteButtons[0]);
      
      expect(window.confirm).toHaveBeenCalledWith(
        'Are you sure you want to delete station "Test Station"?\nThis action cannot be undone.'
      );
      
      await waitFor(() => {
        expect(api.delete).toHaveBeenCalledWith('/admin/stations/1', {
          headers: { 'x-admin-secret': 'test-secret' }
        });
      });
    });

    it('cancels deletion when user declines confirmation', async () => {
      window.confirm = vi.fn(() => false);
      
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText('Test Station')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
      await user.click(deleteButtons[0]);
      
      expect(api.delete).not.toHaveBeenCalled();
    });

    it('handles manage station action', async () => {
      const onSwitchView = vi.fn();
      render(<AdminPanel onSwitchView={onSwitchView} />);
      
      await waitFor(() => {
        expect(screen.getByText('Test Station')).toBeInTheDocument();
      });
      
      const manageButtons = screen.getAllByRole('button', { name: /Manage/i });
      await user.click(manageButtons[0]);
      
      await waitFor(() => {
        expect(localStorage.getItem('personStationId')).toBe('1');
        expect(localStorage.getItem('personManagerId')).toBe('mgr-1');
        expect(onSwitchView).toHaveBeenCalledWith('person');
      });
    });

    it('disables manage button when manager ID is not available', async () => {
      (api.get as Mock).mockImplementation((url: string) => {
        if (url === '/stations') {
          return Promise.resolve({ 
            data: [{ id: '3', name: 'No Manager Station' }] 
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });
      
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText('No Manager Station')).toBeInTheDocument();
      });
      
      const manageButton = screen.getByRole('button', { name: /Manage/i });
      expect(manageButton).toBeDisabled();
      expect(manageButton).toHaveAttribute('title', 'Manager ID not available');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      localStorage.setItem('adminSecret', 'test-secret');
    });

    it('handles station creation error', async () => {
      (api.post as Mock).mockRejectedValueOnce({
        response: { data: { error: 'Station name already exists' } }
      });
      
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
      
      const nameInput = screen.getByPlaceholderText(/Station Name/i);
      const createButton = screen.getByRole('button', { name: /Create Station/i });
      
      await user.type(nameInput, 'Duplicate Station');
      await user.click(createButton);
      
      await waitFor(() => {
        expect(screen.getByText(/Station name already exists/i)).toBeInTheDocument();
      });
    });

    it('handles station deletion error', async () => {
      (api.delete as Mock).mockRejectedValueOnce({
        response: { data: { error: 'Station has active queues' } }
      });
      
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText('Test Station')).toBeInTheDocument();
      });
      
      const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
      await user.click(deleteButtons[0]);
      
      await waitFor(() => {
        expect(screen.getByText(/Station has active queues/i)).toBeInTheDocument();
      });
    });

    it('clears auth on 403 error', async () => {
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
      
      // Simulate 403 error on create
      (api.post as Mock).mockRejectedValueOnce({
        response: { data: { error: 'Forbidden' } }
      });
      
      const nameInput = screen.getByPlaceholderText(/Station Name/i);
      const createButton = screen.getByRole('button', { name: /Create Station/i });
      
      await user.type(nameInput, 'Test');
      await user.click(createButton);
      
      await waitFor(() => {
        expect(localStorage.getItem('adminSecret')).toBeNull();
        expect(screen.getByText(/Admin Login/i)).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(() => {
      localStorage.setItem('adminSecret', 'test-secret');
    });

    it('subscribes to station updates when authenticated', async () => {
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
      
      expect(ablyUtils.subscribeToChannel).toHaveBeenCalledWith(
        'stations',
        'station:create',
        expect.any(Function)
      );
      
      expect(ablyUtils.subscribeToChannel).toHaveBeenCalledWith(
        'stations',
        'station:delete',
        expect.any(Function)
      );
    });

    it('refreshes stations on real-time update', async () => {
      let createCallback: () => void = () => {};
      
      (ablyUtils.subscribeToChannel as Mock).mockImplementation(
        async (_channel: string, _event: string, callback: () => void) => {
          if (_event === 'station:create') {
            createCallback = callback;
          }
          return vi.fn();
        }
      );
      
      render(<AdminPanel />);
      
      await waitFor(() => {
        expect(screen.getByText(/Admin: Create Station/i)).toBeInTheDocument();
      });
      
      // Clear previous calls
      (api.get as Mock).mockClear();
      
      // Simulate real-time update
      createCallback();
      
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/stations', {
          headers: { 'x-admin-secret': 'test-secret' }
        });
      });
    });
  });
});