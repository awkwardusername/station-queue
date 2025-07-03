import * as Ably from 'ably';
import { getApiBaseUrl } from './config/api.config';

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
let connectionState: 'connected' | 'connecting' | 'disconnected' | 'failed' = 'disconnected';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE = 1000; // 1 second base delay

// Connection state listeners
const connectionStateListeners: ((state: string) => void)[] = [];

export const addConnectionStateListener = (listener: (state: string) => void) => {
  connectionStateListeners.push(listener);
  // Immediately call with current state
  listener(connectionState);
};

export const removeConnectionStateListener = (listener: (state: string) => void) => {
  const index = connectionStateListeners.indexOf(listener);
  if (index > -1) {
    connectionStateListeners.splice(index, 1);
  }
};

const notifyConnectionStateChange = (state: string) => {
  connectionState = state as typeof connectionState;
  connectionStateListeners.forEach(listener => {
    try {
      listener(state);
    } catch (error) {
      console.error('Error in connection state listener:', error);
    }
  });
};

// Get Ably API key from the backend with retry mechanism
export const getAblyApiKey = async (retries = 3, delay = 1000): Promise<string | null> => {
  try {
    const baseUrl = getApiBaseUrl();
    // Explicitly request the frontend key
    const response = await fetch(`${baseUrl}/config/ably-key?frontend=true`);
    
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

// Exponential backoff reconnection logic
const scheduleReconnect = async (userId: string) => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
    notifyConnectionStateChange('failed');
    return null;
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1);
  console.log(`Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
  
  notifyConnectionStateChange('connecting');
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Reset ably instance to force recreation
  if (ably) {
    try {
      ably.close();
    } catch (error) {
      console.warn('Error closing existing Ably connection:', error);
    }
    ably = null;
  }
  
  return initAbly(userId);
};

// Initialize the Ably client with improved error handling and reconnection
export const initAbly = async (userId: string) => {
  // If already initialized and connected, return the existing instance
  if (ably && ably.connection.state === 'connected') {
    return ably;
  }
  
  clientId = userId;
  notifyConnectionStateChange('connecting');
  
  try {
    // Get the Ably API key from the backend
    const apiKey = await getAblyApiKey();
    if (!apiKey) {
      console.error('Failed to initialize Ably: No API key available');
      notifyConnectionStateChange('failed');
      return null;
    }
    
    // Create a new Ably client with enhanced options
    ably = new Ably.Realtime({
      key: apiKey,
      clientId,
      echoMessages: false, // Don't receive messages sent by this client
      autoConnect: true,
      disconnectedRetryTimeout: 15000,
      suspendedRetryTimeout: 30000,
    });

    // Enhanced connection state handling
    ably.connection.on('connected', () => {
      console.log('Ably connection established');
      reconnectAttempts = 0; // Reset on successful connection
      notifyConnectionStateChange('connected');
    });

    ably.connection.on('connecting', () => {
      console.log('Ably connecting...');
      notifyConnectionStateChange('connecting');
    });

    ably.connection.on('disconnected', () => {
      console.warn('Ably connection disconnected');
      notifyConnectionStateChange('disconnected');
    });

    ably.connection.on('suspended', () => {
      console.warn('Ably connection suspended');
      notifyConnectionStateChange('disconnected');
    });

    ably.connection.on('failed', (err) => {
      console.error('Ably connection failed:', err);
      notifyConnectionStateChange('failed');
      
      // Schedule reconnection
      setTimeout(() => {
        if (clientId) {
          scheduleReconnect(clientId);
        }
      }, 1000);
    });

    ably.connection.on('closed', () => {
      console.log('Ably connection closed');
      notifyConnectionStateChange('disconnected');
    });

    return ably;
  } catch (error) {
    console.error('Error initializing Ably client:', error);
    notifyConnectionStateChange('failed');
    
    // Schedule reconnection on error
    setTimeout(() => {
      if (clientId) {
        scheduleReconnect(clientId);
      }
    }, 1000);
    
    return null;
  }
};

// Get the Ably client (initialize if needed)
export const getAbly = async (userId: string) => {
  if (!ably) return await initAbly(userId);
  return ably;
};

// Enhanced subscription with retry logic and error handling
export const subscribeToChannel = async (
  channelName: string,
  eventName: string,
  callback: (message: unknown) => void,
  maxRetries = 3
): Promise<() => void> => {
  const attemptSubscription = async (retryCount = 0): Promise<() => void> => {
    try {
      // Make sure Ably is initialized
      if (!ably || ably.connection.state === 'failed') {
        const userId = clientId || localStorage.getItem('userId') || '';
        ably = await initAbly(userId);
        if (!ably) {
          throw new Error('Failed to initialize Ably');
        }
      }

      // Wait for connection if not already connected
      if (ably.connection.state !== 'connected') {
        console.log(`Waiting for Ably connection before subscribing to ${channelName}:${eventName}`);
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000); // 10 second timeout

          if (ably!.connection.state === 'connected') {
            clearTimeout(timeout);
            resolve();
            return;
          }

          ably!.connection.once('connected', () => {
            clearTimeout(timeout);
            resolve();
          });

          ably!.connection.once('failed', (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      }

      console.log(`Subscribing to ${channelName} channel for ${eventName} events`);
      const channel = ably.channels.get(channelName);
      
      // Enhanced message handler with error handling
      const messageHandler = (message: Ably.Message) => {
        try {
          console.log(`Received on ${channelName}:${eventName}`, message.data);
          callback(message.data);
        } catch (error) {
          console.error(`Error processing message on ${channelName}:${eventName}:`, error);
        }
      };

      channel.subscribe(eventName, messageHandler);

      // Return enhanced unsubscribe function
      return () => {
        try {
          console.log(`Unsubscribing from ${channelName}:${eventName}`);
          channel.unsubscribe(eventName, messageHandler);
        } catch (error) {
          console.error(`Error unsubscribing from ${channelName}:${eventName}:`, error);
        }
      };
    } catch (error) {
      console.error(`Error subscribing to ${channelName}:${eventName} (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries) {
        const delay = 1000 * Math.pow(2, retryCount); // Exponential backoff
        console.log(`Retrying subscription to ${channelName}:${eventName} in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptSubscription(retryCount + 1);
      }
      
      console.error(`Failed to subscribe to ${channelName}:${eventName} after ${maxRetries + 1} attempts`);
      return () => {}; // Return empty unsubscribe function
    }
  };

  return attemptSubscription();
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

// Force reconnection (useful for manual recovery attempts)
export const forceReconnect = async () => {
  console.log('Forcing Ably reconnection...');
  if (ably) {
    try {
      ably.close();
    } catch (error) {
      console.warn('Error closing existing Ably connection:', error);
    }
    ably = null;
  }
  
  const userId = clientId || localStorage.getItem('userId') || '';
  if (userId) {
    return await initAbly(userId);
  }
  return null;
};

// Get current connection state
export const getConnectionState = () => {
  return connectionState;
};

// Health check for the connection
export const isConnectionHealthy = () => {
  return ably && ably.connection.state === 'connected';
};

// Close the Ably connection when no longer needed
export const closeAbly = () => {
  if (ably) {
    ably.close();
    ably = null;
  }
  notifyConnectionStateChange('disconnected');
};
