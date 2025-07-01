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

// Helper function to determine API base URL (duplicated from api.ts to avoid circular dependencies)
const getApiBaseUrl = () => {
  if (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.port.startsWith('517') // Handle Vite's default ports (5173, 5174, etc)
  ) {
    return 'http://localhost:5000';
  }
  return '/.netlify/functions/api';
};

// Get Ably API key from the backend with retry mechanism
export const getAblyApiKey = async (retries = 3, delay = 1000): Promise<string | null> => {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/config/ably-key`);
    
    if (!response.ok) {
      if (retries > 0) {
        console.log(`Retrying fetch Ably API key (${retries} attempts left)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return getAblyApiKey(retries - 1, delay * 1.5);
      }
      throw new Error(`Failed to fetch Ably API key: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.key) {
      throw new Error('Ably API key not found in response');
    }
    return data.key;
  } catch (error) {
    console.error('Error fetching Ably API key:', error);
    return null;
  }
};

// Initialize the Ably client
export const initAbly = async (userId: string) => {
  // If already initialized, return the existing instance
  if (ably) return ably;
  
  clientId = userId;
  
  try {
    // Get the Ably API key from the backend
    const apiKey = await getAblyApiKey();
    if (!apiKey) {
      console.error('Failed to initialize Ably: No API key available');
      return null;
    }
    
    // Create a new Ably client
    ably = new Ably.Realtime({
      key: apiKey,
      clientId,
      echoMessages: false, // Don't receive messages sent by this client
    });

    // Add connection state handling
    ably.connection.on('connected', () => {
      console.log('Ably connection established');
    });

    ably.connection.on('failed', (err) => {
      console.error('Ably connection failed:', err);
    });

    return ably;
  } catch (error) {
    console.error('Error initializing Ably client:', error);
    return null;
  }
};

// Get the Ably client (initialize if needed)
export const getAbly = async (userId: string) => {
  if (!ably) return await initAbly(userId);
  return ably;
};

// Subscribe to a channel
export const subscribeToChannel = async (
  channelName: string, 
  eventName: string, 
  callback: (message: unknown) => void
): Promise<() => void> => {
  try {
    // Make sure Ably is initialized
    if (!ably) {
      const userId = clientId || localStorage.getItem('userId') || '';
      ably = await initAbly(userId);
      if (!ably) {
        console.error('Failed to initialize Ably');
        return () => {}; // Return empty unsubscribe function
      }
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
  } catch (error) {
    console.error(`Error subscribing to ${channelName}:${eventName}:`, error);
    return () => {}; // Return empty unsubscribe function
  }
};

// Publish to a channel
export const publishToChannel = async (channelName: string, eventName: string, data: unknown) => {
  try {
    // Make sure Ably is initialized
    if (!ably) {
      const userId = clientId || localStorage.getItem('userId') || '';
      ably = await initAbly(userId);
      if (!ably) {
        throw new Error('Failed to initialize Ably');
      }
    }

    const channel = ably.channels.get(channelName);
    return await channel.publish(eventName, data);
  } catch (error) {
    console.error(`Error publishing to ${channelName}:${eventName}:`, error);
    throw error;
  }
};

// Helper to subscribe to queue updates for a specific station
export const subscribeToQueueUpdates = async (stationId: string, callback: (data: unknown) => void) => {
  const channelName = CHANNEL_NAMES.QUEUE(stationId);
  return await subscribeToChannel(channelName, EVENT_NAMES.QUEUE_UPDATE, callback);
};

// Helper to subscribe to station updates
export const subscribeToStationUpdates = async (callback: (data: unknown) => void) => {
  return await subscribeToChannel(CHANNEL_NAMES.STATIONS, EVENT_NAMES.STATION_UPDATE, callback);
};

// Helper to subscribe to my queue updates
export const subscribeToMyQueueUpdates = async (userId: string, callback: (data: unknown) => void) => {
  const channelName = CHANNEL_NAMES.MY_QUEUES(userId);
  return await subscribeToChannel(channelName, EVENT_NAMES.QUEUE_UPDATE, callback);
};

// Close the Ably connection when no longer needed
export const closeAbly = () => {
  if (ably) {
    ably.close();
    ably = null;
  }
};
