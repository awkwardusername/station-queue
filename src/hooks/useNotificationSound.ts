import { useCallback } from 'react';
import { NOTIFICATION_SOUND } from '../constants/queue.constants';

interface WindowWithWebkit extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export const useNotificationSound = () => {
  const playSound = useCallback(() => {
    try {
      // Check if AudioContext is supported
      const AudioContextClass = window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('AudioContext not supported, skipping notification sound');
        return;
      }

      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = NOTIFICATION_SOUND.frequency;
      gainNode.gain.value = NOTIFICATION_SOUND.gain;
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.start();
      oscillator.stop(ctx.currentTime + NOTIFICATION_SOUND.duration);
      
      oscillator.onended = () => {
        ctx.close().catch(() => {
          // Ignore close errors
        });
      };
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  }, []);

  return { playSound };
};