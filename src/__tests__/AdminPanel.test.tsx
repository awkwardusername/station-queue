// src/__tests__/AdminPanel.test.tsx
// Mock axios at the very top before any imports!
const mockGet = vi.fn().mockImplementation((url) => {
  console.log('MOCK GET CALLED', url);
  return Promise.resolve({
    data: [
      { id: '1', name: 'Test Station', managerId: 'mgr-1' }
    ]
  });
});
const mockAxiosInstance = {
  get: mockGet,
  post: vi.fn(),
  delete: vi.fn(),
  interceptors: { request: { use: vi.fn() } }
};
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxiosInstance)
  }
}));
vi.mock('./../ablyUtils', () => ({
  initAbly: vi.fn().mockResolvedValue(undefined),
  subscribeToChannel: vi.fn(() => () => {}),
  CHANNEL_NAMES: {
    STATIONS: 'stations',
  },
  EVENT_NAMES: {
    STATION_CREATE: 'station:create',
    STATION_DELETE: 'station:delete',
  },
}));

vi.mock('./../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    getOrSetUserId: () => 'mock-user-id'
  };
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

describe('AdminPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders login form when not authenticated', async () => {
    // Clear localStorage and reload the component
    window.localStorage.clear();
    const { default: AdminPanel } = await import('../AdminPanel');
    render(<AdminPanel />);
    expect(screen.getByText(/Admin Login/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Admin Secret/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unlock Admin/i })).toBeInTheDocument();
  });

  it('shows "Create Station" form after authentication mock', async () => {
    window.localStorage.setItem('adminSecret', 'test');
    const { default: AdminPanel } = await import('../AdminPanel');
    render(<AdminPanel />);
    // Wait for loading spinner to disappear (if present)
    await waitFor(() => {
      expect(screen.queryByText(/Checking.../i)).not.toBeInTheDocument();
    }, { timeout: 15000 });
    // Assert axios mock was called (debug)
    expect(mockGet).toHaveBeenCalled();
    // Now check for the Create Station button (form indicator)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create Station/i })).toBeInTheDocument();
    }, { timeout: 15000 });
  }, 15000);

  it('shows stations table after authentication mock', async () => {
    window.localStorage.setItem('adminSecret', 'test');
    const { default: AdminPanel } = await import('../AdminPanel');
    render(<AdminPanel />);
    await waitFor(() => {
      expect(screen.getByText(/Stations/i)).toBeInTheDocument();
    }, { timeout: 10000 });
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});