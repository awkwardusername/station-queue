export interface Station {
  id: string;
  name: string;
}

export interface QueueItem {
  stationId: string;
  stationName: string;
  queueNumber: number;
  actualPosition?: number;
}

export type NotificationType = 'removed' | 'position' | 'error';

export interface Notification {
  msg: string;
  ts: number;
  type: NotificationType;
  station: string;
  queueNumber?: number;
  prevQueueNumber?: number;
}

export interface QueueState {
  stations: Station[];
  selected: string;
  queueNumber: number | null;
  loading: boolean;
  myQueues: QueueItem[];
  userId: string;
  lastUpdate: Date | null;
  isUsingFallback: boolean;
  notifications: Notification[];
  showDropdown: boolean;
  bellAnimate: boolean;
}