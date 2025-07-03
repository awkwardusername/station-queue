import { useState, useCallback, useEffect } from 'react';
import type { Notification } from '../types/queue.types';
import { MAX_NOTIFICATIONS, STORAGE_KEYS } from '../constants/queue.constants';
import { useNotificationSound } from './useNotificationSound';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [bellAnimate, setBellAnimate] = useState(false);
  const { playSound } = useNotificationSound();

  // Load notifications from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.notifications);
    if (stored) {
      try {
        setNotifications(JSON.parse(stored));
      } catch {
        // Ignore JSON parse errors
      }
    }
  }, []);

  const addNotifications = useCallback((newNotifications: Notification[]) => {
    if (newNotifications.length === 0) return;

    setNotifications(prev => {
      const updated = [...newNotifications, ...prev].slice(0, MAX_NOTIFICATIONS);
      localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(updated));
      return updated;
    });

    // Animate bell and play sound
    setBellAnimate(true);
    playSound();
  }, [playSound]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    localStorage.setItem(STORAGE_KEYS.notifications, '[]');
  }, []);

  const toggleDropdown = useCallback(() => {
    setShowDropdown(prev => !prev);
  }, []);

  const hideDropdown = useCallback(() => {
    setShowDropdown(false);
  }, []);

  return {
    notifications,
    showDropdown,
    bellAnimate,
    setBellAnimate,
    addNotifications,
    clearNotifications,
    toggleDropdown,
    hideDropdown,
  };
};