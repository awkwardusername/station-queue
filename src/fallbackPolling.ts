// Fallback polling utilities for when real-time updates fail
import api from './api';

interface QueueItem {
  stationId: string;
  stationName: string;
  queueNumber: number;
}

interface Station {
  id: string;
  name: string;
}

// Polling intervals (in milliseconds)
const POLLING_INTERVALS = {
  FAST: 2000,    // 2 seconds - when real-time is failed
  NORMAL: 5000,  // 5 seconds - when real-time is unstable
  SLOW: 10000,   // 10 seconds - background polling
};

class FallbackPoller {
  private pollingInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastPollTime = 0;
  private pollInterval = POLLING_INTERVALS.NORMAL;
  private pollFunction: () => Promise<void>;
  private onError?: (error: Error) => void;

  constructor(
    pollFunction: () => Promise<void>,
    onError?: (error: Error) => void
  ) {
    this.pollFunction = pollFunction;
    this.onError = onError;
  }

  start(interval: number = POLLING_INTERVALS.NORMAL) {
    if (this.isPolling) {
      this.stop();
    }

    this.pollInterval = interval;
    this.isPolling = true;
    
    console.log(`Starting fallback polling with ${interval}ms interval`);
    
    // Poll immediately
    this.poll();
    
    // Then poll at intervals
    this.pollingInterval = setInterval(() => {
      this.poll();
    }, interval);
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    console.log('Fallback polling stopped');
  }

  private async poll() {
    if (!this.isPolling) return;

    try {
      this.lastPollTime = Date.now();
      await this.pollFunction();
    } catch (error) {
      console.error('Fallback polling error:', error);
      if (this.onError) {
        this.onError(error as Error);
      }
    }
  }

  isActive() {
    return this.isPolling;
  }

  getLastPollTime() {
    return this.lastPollTime;
  }

  adjustInterval(newInterval: number) {
    if (this.isPolling && newInterval !== this.pollInterval) {
      this.start(newInterval);
    }
  }
}

// Factory functions for common polling scenarios
export const createMyQueuesPoller = (
  onUpdate: (queues: QueueItem[]) => void,
  onError?: (error: Error) => void
) => {
  const pollFunction = async () => {
    try {
      const res = await api.get<QueueItem[]>('/my-queues');
      const queues = Array.isArray(res.data) ? res.data : [];
      onUpdate(queues);
    } catch (error) {
      throw new Error(`Failed to fetch my queues: ${error}`);
    }
  };

  return new FallbackPoller(pollFunction, onError);
};

export const createStationsPoller = (
  onUpdate: (stations: Station[]) => void,
  onError?: (error: Error) => void
) => {
  const pollFunction = async () => {
    try {
      const res = await api.get<Station[]>('/stations');
      const stations = Array.isArray(res.data) ? res.data : [];
      onUpdate(stations);
    } catch (error) {
      throw new Error(`Failed to fetch stations: ${error}`);
    }
  };

  return new FallbackPoller(pollFunction, onError);
};

export const createQueuePoller = (
  stationId: string,
  managerId: string,
  onUpdate: (queue: { user_id: string; position: number }[]) => void,
  onError?: (error: Error) => void
) => {
  const pollFunction = async () => {
    try {
      const res = await api.get<{ queue: { user_id: string; position: number }[] }>(
        `/queue/${stationId}?managerId=${managerId}`
      );
      onUpdate(res.data.queue || []);
    } catch (error) {
      throw new Error(`Failed to fetch queue for station ${stationId}: ${error}`);
    }
  };

  return new FallbackPoller(pollFunction, onError);
};

// Export polling intervals for external use
export { POLLING_INTERVALS };
export default FallbackPoller;