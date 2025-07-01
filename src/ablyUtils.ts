import * as Ably from 'ably';

// Channel names for different entities
export const CHANNEL_NAMES = {
  QUEUE: (stationId: string) => `queue:${stationId}`,
  STATIONS: 'stations',
  MY_QUEUES: (userId: string) => `my-queues:${userId}`,
};

// Event names for actions
export const EVENT_NAMES = {
  QUEUE_UPDATE: 'queue:update',
  QUEUE_POP: 'queue:pop',
  STATION_UPDATE: 'station:update',
  STATION_CREATE: 'station:create',
  STATION_DELETE: 'station:delete',
};

let ably: Ably.Realtime | null = null;
let clientId = '';

// Initialize the Ably client
export const initAbly = (userId: string) => {
  if (ably) return ably;
  
  clientId = userId;
  ably = new Ably.Realtime({
    key: import.meta.env.VITE_ABLY_API_KEY || '',
    clientId,
  });

  return ably;
};

// Get the Ably client (initialize if needed)
export const getAbly = (userId: string) => {
  if (!ably) return initAbly(userId);
  return ably;
};

// Subscribe to a channel
export const subscribeToChannel = (channelName: string, eventName: string, callback: (message: any) => void) => {
  if (!ably) {
    console.error('Ably not initialized');
    return () => {}; // Return empty unsubscribe function
  }

  console.log(`Subscribing to ${channelName} channel for ${eventName} events`);
  const channel = ably.channels.get(channelName);
  channel.subscribe(eventName, (message) => {
    console.log(`Received on ${channelName}:${eventName}`, message.data);
    callback(message.data);
  });

  // Return unsubscribe function
  return () => {
    console.log(`Unsubscribing from ${channelName}:${eventName}`);
    channel.unsubscribe(eventName, callback);
  };
};

// Publish to a channel
export const publishToChannel = (channelName: string, eventName: string, data: any) => {
  if (!ably) {
    console.error('Ably not initialized');
    return Promise.reject('Ably not initialized');
  }

  const channel = ably.channels.get(channelName);
  return channel.publish(eventName, data);
};

// Helper to subscribe to queue updates for a specific station
export const subscribeToQueueUpdates = (stationId: string, callback: (data: any) => void) => {
  const channelName = CHANNEL_NAMES.QUEUE(stationId);
  return subscribeToChannel(channelName, EVENT_NAMES.QUEUE_UPDATE, callback);
};

// Helper to subscribe to station updates
export const subscribeToStationUpdates = (callback: (data: any) => void) => {
  return subscribeToChannel(CHANNEL_NAMES.STATIONS, EVENT_NAMES.STATION_UPDATE, callback);
};

// Helper to subscribe to my queue updates
export const subscribeToMyQueueUpdates = (userId: string, callback: (data: any) => void) => {
  const channelName = CHANNEL_NAMES.MY_QUEUES(userId);
  return subscribeToChannel(channelName, EVENT_NAMES.QUEUE_UPDATE, callback);
};

// Close the Ably connection when no longer needed
export const closeAbly = () => {
  if (ably) {
    ably.close();
    ably = null;
  }
};
