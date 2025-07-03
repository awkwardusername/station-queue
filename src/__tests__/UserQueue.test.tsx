// src/__tests__/UserQueue.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserQueue from '../UserQueue';

describe('UserQueue', () => {
  beforeEach(() => {
    // Clear localStorage and mocks before each test
    window.localStorage.clear();
  });

  it('renders without crashing', () => {
    render(<UserQueue />);
    expect(screen.getByText(/Queue for a Station/i)).toBeInTheDocument();
  });

  it('shows station select dropdown', () => {
    render(<UserQueue />);
    expect(screen.getByLabelText(/Select a station/i)).toBeInTheDocument();
  });

  it('disables "Join Queue" button when no station is selected', () => {
    render(<UserQueue />);
    const button = screen.getByRole('button', { name: /join queue/i });
    expect(button).toBeDisabled();
  });

  it('shows "You are not in any queues" when myQueues is empty', () => {
    render(<UserQueue />);
    expect(screen.getByText(/You are not in any queues/i)).toBeInTheDocument();
  });

  it('shows notification bell', () => {
    render(<UserQueue />);
    expect(screen.getByLabelText(/Notifications/i)).toBeInTheDocument();
  });

  // Additional tests for notification dropdown and fallback polling indicator can be added with more mocking
});