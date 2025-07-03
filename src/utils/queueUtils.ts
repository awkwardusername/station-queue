import type { QueueItem, Notification } from '../types/queue.types';
import { NOTIFICATION_ICONS } from '../constants/queue.constants';

export const calculateActualPosition = (
  queues: QueueItem[],
  targetStationId: string,
  targetQueueNumber: number
): number => {
  const stationQueues = queues.filter(q => q.stationId === targetStationId);
  // Use toSorted() for immutability, or sort a copy if toSorted() is not available
  const sortedQueues = [...stationQueues].sort((a, b) => a.queueNumber - b.queueNumber);
  const position = sortedQueues.findIndex(q => q.queueNumber === targetQueueNumber) + 1;
  
  console.log(`calculateActualPosition: Station ${targetStationId}, target queue number ${targetQueueNumber}`);
  console.log(`  - Station queues:`, stationQueues.map(q => `${q.queueNumber}`));
  console.log(`  - Sorted queues:`, sortedQueues.map(q => `${q.queueNumber}`));
  console.log(`  - Calculated position:`, position);
  
  return position;
};

export const getNotificationIcon = (type: Notification['type']): string => {
  return NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.default;
};

export const generateNotifications = (
  prevQueues: QueueItem[],
  currentQueues: QueueItem[]
): Notification[] => {
  const notifications: Notification[] = [];

  // Check for removed queues
  prevQueues.forEach(prevQ => {
    const nowQ = currentQueues.find(q => q.stationId === prevQ.stationId);
    if (!nowQ) {
      notifications.push({
        msg: `You were removed from "${prevQ.stationName}" queue (# ${prevQ.queueNumber}).`,
        ts: Date.now(),
        type: 'removed',
        station: prevQ.stationName,
        prevQueueNumber: prevQ.queueNumber
      });
    }
  });

  // Check for position changes
  currentQueues.forEach(nowQ => {
    const prevQ = prevQueues.find(p => p.stationId === nowQ.stationId);
    if (prevQ) {
      const currentActualPosition = nowQ.actualPosition || 1;
      const prevActualPosition = prevQ.actualPosition || 1;
      
      if (currentActualPosition !== prevActualPosition) {
        if (currentActualPosition < prevActualPosition) {
          notifications.push({
            msg: `You moved up in "${nowQ.stationName}" queue! Now position ${currentActualPosition} in line.`,
            ts: Date.now(),
            type: 'position',
            station: nowQ.stationName,
            queueNumber: currentActualPosition
          });
        } else {
          notifications.push({
            msg: `Your position in "${nowQ.stationName}" changed to ${currentActualPosition} in line.`,
            ts: Date.now(),
            type: 'position',
            station: nowQ.stationName,
            queueNumber: currentActualPosition
          });
        }
      }
    }
  });

  return notifications;
};

export const validateQueueData = (data: unknown): data is QueueItem[] => {
  if (!Array.isArray(data)) return false;
  
  return data.every(item => 
    typeof item === 'object' &&
    item !== null &&
    'stationId' in item &&
    'stationName' in item &&
    'queueNumber' in item &&
    typeof item.stationId === 'string' &&
    typeof item.stationName === 'string' &&
    typeof item.queueNumber === 'number'
  );
};