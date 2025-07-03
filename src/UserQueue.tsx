import 'bootstrap/dist/css/bootstrap.min.css';
import './ConnectionStatus.css';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import api from './api';
import {
  initAbly,
  subscribeToMyQueueUpdates,
  CHANNEL_NAMES,
  EVENT_NAMES,
  subscribeToChannel,
  addConnectionStateListener,
  removeConnectionStateListener
} from './ablyUtils';
import { createMyQueuesPoller, createStationsPoller, POLLING_INTERVALS } from './fallbackPolling';
import type { Station, QueueItem, Notification } from './types/queue.types';
import { STORAGE_KEYS, UI_CONSTANTS } from './constants/queue.constants';
import { useNotifications } from './hooks/useNotifications';
import { generateNotifications, validateQueueData, getNotificationIcon } from './utils/queueUtils';

// Separate components for better organization
const NotificationBell: React.FC<{
  notifications: Notification[];
  showDropdown: boolean;
  bellAnimate: boolean;
  onToggle: () => void;
  onClear: () => void;
  onAnimationEnd: () => void;
}> = ({ notifications, showDropdown, bellAnimate, onToggle, onClear, onAnimationEnd }) => {
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  }, [onToggle]);

  const handleBlur = useCallback(() => {
    // Note: This timeout will be cleared when the component unmounts or when focus returns
    setTimeout(() => {
      if (showDropdown) {
        onToggle();
      }
    }, UI_CONSTANTS.notificationBlurTimeout);
  }, [onToggle, showDropdown]);

  return (
    <div className="notification-bell-container">
      <button
        className="notification-bell"
        type="button"
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        aria-label="Notifications"
        aria-expanded={showDropdown}
        aria-haspopup="true"
      >
        <span
          className={bellAnimate ? 'bell-animate' : ''}
          onAnimationEnd={onAnimationEnd}
          aria-hidden="true"
        >
          🔔
        </span>
        {notifications.length > 0 && (
          <span className="notification-badge">{notifications.length}</span>
        )}
      </button>
      {showDropdown && (
        <NotificationDropdown
          notifications={notifications}
          onClear={onClear}
        />
      )}
    </div>
  );
};

const NotificationDropdown: React.FC<{
  notifications: Notification[];
  onClear: () => void;
}> = ({ notifications, onClear }) => (
  <div className="notification-dropdown">
    <ul>
      {notifications.length === 0 ? (
        <li>No notifications</li>
      ) : (
        notifications.map((n, i) => (
          <li key={`${n.ts}-${i}`} className="notification-list-item">
            <span className="notification-icon">
              {getNotificationIcon(n.type)}
            </span>
            <NotificationContent notification={n} />
          </li>
        ))
      )}
    </ul>
    <div className="notification-dropdown-footer">
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={onClear}
      >
        Clear All
      </button>
    </div>
  </div>
);

const NotificationContent: React.FC<{ notification: Notification }> = ({ notification }) => {
  // Extract notification message logic to avoid nested ternary
  const renderNotificationMessage = () => {
    if (notification.type === 'removed') {
      return (
        <>
          Removed from <b>{notification.station}</b> queue
          {typeof notification.prevQueueNumber === 'number' && (
            <> (# <b>{notification.prevQueueNumber}</b>)</>
          )}
          .
        </>
      );
    }
    
    if (notification.type === 'error') {
      return <>{notification.msg}</>;
    }
    
    // Default case for position change notifications
    return (
      <>
        Position in <b>{notification.station}</b> changed to{' '}
        <b>{notification.queueNumber}</b>.
      </>
    );
  };

  return (
    <span>
      {renderNotificationMessage()}
      <br />
      <span className="notification-time">
        {notification.ts ? new Date(notification.ts).toLocaleTimeString() : ''}
      </span>
    </span>
  );
};

const UserQueue: React.FC = () => {
  // State management
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [myQueues, setMyQueues] = useState<QueueItem[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  // Use custom hooks
  const {
    notifications,
    showDropdown,
    bellAnimate,
    setBellAnimate,
    addNotifications,
    clearNotifications,
    toggleDropdown,
  } = useNotifications();

  // Refs for managing state and pollers
  const prevQueuesRef = useRef<QueueItem[]>([]);
  const myQueuesPollerRef = useRef<ReturnType<typeof createMyQueuesPoller> | null>(null);
  const stationsPollerRef = useRef<ReturnType<typeof createStationsPoller> | null>(null);

  // Memoized values
  const selectedStationName = useMemo(() => {
    const found = myQueues.find(q => q.stationId === selected);
    if (found) return found.stationName;
    const station = stations.find(s => s.id === selected);
    return station?.name ?? 'Station';
  }, [myQueues, stations, selected]);

  // Initialize user ID
  useEffect(() => {
    let storedUserId = localStorage.getItem(STORAGE_KEYS.userId);
    
    if (!storedUserId) {
      storedUserId = uuidv4();
      localStorage.setItem(STORAGE_KEYS.userId, storedUserId);
      console.log('UserQueue: Generated new userId:', storedUserId);
    }
    
    console.log('UserQueue: Initializing with userId', storedUserId);
    setUserId(storedUserId);
  }, []);

  // Initialize Ably connection
  useEffect(() => {
    if (!userId) return;

    let mounted = true;
    let retryTimeout: NodeJS.Timeout | null = null;

    const initializeAbly = async () => {
      if (!mounted) return;
      
      try {
        const client = await initAbly(userId);
        if (client) {
          console.log('UserQueue: Ably initialized successfully');
        } else {
          console.warn('UserQueue: Ably client is null, real-time updates may not work');
          if (mounted) {
            retryTimeout = setTimeout(initializeAbly, UI_CONSTANTS.ablyRetryDelay);
          }
        }
      } catch (error) {
        console.error('UserQueue: Failed to initialize Ably:', error);
        if (mounted) {
          retryTimeout = setTimeout(initializeAbly, UI_CONSTANTS.ablyRetryDelay);
        }
      }
    };

    initializeAbly();
    
    return () => {
      mounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [userId]);

  // API calls
  const fetchStations = useCallback(async () => {
    console.log('UserQueue: Fetching stations');
    try {
      const res = await api.get<Station[]>('/stations');
      setStations(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching stations:', error);
      setStations([]);
      
      // Show error notification to user
      addNotifications([{
        msg: 'Failed to load stations. Please refresh the page.',
        ts: Date.now(),
        type: 'error',
        station: 'System'
      }]);
    }
  }, [addNotifications]);

  const fetchMyQueues = useCallback(async () => {
    if (!userId) return;
    console.log('UserQueue: Fetching my queues for userId', userId);
    
    try {
      const res = await api.get<QueueItem[]>('/my-queues');
      console.log('UserQueue: My queues data received:', res.data);
      const newQueueData = Array.isArray(res.data) ? res.data : [];
      
      // Generate notifications if we have previous data
      if (prevQueuesRef.current.length > 0) {
        const newNotifications = generateNotifications(prevQueuesRef.current, newQueueData);
        if (newNotifications.length > 0) {
          console.log('UserQueue: Generated notifications:', newNotifications);
          addNotifications(newNotifications);
        }
      }
      
      prevQueuesRef.current = newQueueData;
      setMyQueues(newQueueData);
      setLastUpdate(new Date());
      
      // Update queue number for selected station
      if (selected) {
        const found = newQueueData.find(q => q.stationId === selected);
        setQueueNumber(found ? found.queueNumber : null);
      }
    } catch (error) {
      console.error('Error fetching my queues:', error);
      setMyQueues([]);
      
      // Show error notification to user
      addNotifications([{
        msg: 'Failed to load your queue information. Please try again.',
        ts: Date.now(),
        type: 'error',
        station: 'System'
      }]);
    }
  }, [userId, selected, addNotifications]);

  const joinQueue = useCallback(async () => {
    if (!selected) return;
    
    setLoading(true);
    try {
      console.log('UserQueue: Joining queue for station', selected);
      const res = await api.post<{ queueNumber: number }>(`/queue/${selected}`);
      setQueueNumber(res.data.queueNumber);
      await fetchMyQueues();
    } catch (error) {
      console.error('Error joining queue:', error);
      
      // Show error notification to user
      let errorMessage = 'Unknown error occurred';
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        } else if (axiosError.response?.data?.message) {
          errorMessage = axiosError.response.data.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      const station = stations.find(s => s.id === selected);
      const stationName = station?.name ?? 'Unknown Station';
      
      addNotifications([{
        msg: `Failed to join queue for "${stationName}": ${errorMessage}`,
        ts: Date.now(),
        type: 'error',
        station: stationName
      }]);
    } finally {
      setLoading(false);
    }
  }, [selected, fetchMyQueues, stations, addNotifications]);

  // Handle queue updates from Ably
  const handleQueueUpdate = useCallback((queueData: unknown) => {
    console.log('UserQueue: Received queue update:', queueData);
    
    if (!validateQueueData(queueData)) {
      console.error('UserQueue: Invalid queue data received:', queueData);
      return;
    }

    // Generate notifications
    if (prevQueuesRef.current.length > 0) {
      const newNotifications = generateNotifications(prevQueuesRef.current, queueData);
      if (newNotifications.length > 0) {
        addNotifications(newNotifications);
      }
    }

    prevQueuesRef.current = queueData;
    setMyQueues(queueData);
    setLastUpdate(new Date());

    // Update queue number if needed
    if (selected) {
      const found = queueData.find(q => q.stationId === selected);
      setQueueNumber(found ? found.queueNumber : null);
    }
  }, [selected, addNotifications]);

  // Fallback polling management
  useEffect(() => {
    if (!userId) return;

    const connectionStateListener = (state: string) => {
      console.log('UserQueue: Connection state changed to:', state);

      if (state === 'connected') {
        // Stop fallback polling when connected
        if (myQueuesPollerRef.current?.isActive()) {
          console.log('UserQueue: Stopping fallback polling - real-time connected');
          myQueuesPollerRef.current.stop();
          stationsPollerRef.current?.stop();
          setIsUsingFallback(false);
        }
      } else if (state === 'failed' || state === 'disconnected') {
        // Start fallback polling when disconnected
        if (!myQueuesPollerRef.current?.isActive()) {
          console.log('UserQueue: Starting fallback polling - real-time failed');
          
          myQueuesPollerRef.current = createMyQueuesPoller(
            handleQueueUpdate,
            (error) => console.error('UserQueue: Fallback polling error:', error)
          );

          stationsPollerRef.current = createStationsPoller(
            (stations) => {
              console.log('UserQueue: Fallback polling - received stations:', stations);
              setStations(stations);
            },
            (error) => console.error('UserQueue: Stations fallback polling error:', error)
          );

          const interval = state === 'failed' ? POLLING_INTERVALS.FAST : POLLING_INTERVALS.NORMAL;
          myQueuesPollerRef.current.start(interval);
          stationsPollerRef.current.start(interval);
          setIsUsingFallback(true);
        }
      }
    };

    addConnectionStateListener(connectionStateListener);

    return () => {
      removeConnectionStateListener(connectionStateListener);
      myQueuesPollerRef.current?.stop();
      stationsPollerRef.current?.stop();
    };
  }, [userId, handleQueueUpdate]);

  // Subscribe to Ably channels
  useEffect(() => {
    if (!userId) return;
    
    console.log('UserQueue: Setting up Ably subscriptions for userId', userId);
    
    const unsubscribes: (() => void)[] = [];
    
    const setupSubscriptions = async () => {
      try {
        // Subscribe to station updates
        const stationsUnsubscribe = await subscribeToChannel(
          CHANNEL_NAMES.STATIONS,
          EVENT_NAMES.STATION_CREATE,
          () => {
            console.log('UserQueue: Station created');
            fetchStations();
          }
        );
        unsubscribes.push(stationsUnsubscribe);
        
        const stationsDeleteUnsubscribe = await subscribeToChannel(
          CHANNEL_NAMES.STATIONS,
          EVENT_NAMES.STATION_DELETE,
          () => {
            console.log('UserQueue: Station deleted');
            fetchStations();
          }
        );
        unsubscribes.push(stationsDeleteUnsubscribe);

        // Subscribe to queue pop events for all stations
        if (stations.length > 0) {
          for (const station of stations) {
            const unsubscribe = await subscribeToChannel(
              CHANNEL_NAMES.QUEUE(station.id),
              EVENT_NAMES.QUEUE_POP,
              () => {
                console.log('UserQueue: Queue pop event for station', station.id);
                fetchMyQueues();
              }
            );
            unsubscribes.push(unsubscribe);
          }
        }
        
        // Subscribe to personal queue updates
        const myQueuesUnsubscribe = await subscribeToMyQueueUpdates(userId, handleQueueUpdate);
        unsubscribes.push(myQueuesUnsubscribe);
      } catch (error) {
        console.error('UserQueue: Error setting up subscriptions:', error);
      }
    };
    
    setupSubscriptions();
    
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [userId, stations, fetchStations, fetchMyQueues, handleQueueUpdate]);

  // Initial data fetch
  useEffect(() => {
    if (userId) {
      fetchStations();
      fetchMyQueues();
    }
  }, [userId, fetchStations, fetchMyQueues]);

  // Update queue number when selection changes
  useEffect(() => {
    if (selected) {
      const found = myQueues.find(q => q.stationId === selected);
      setQueueNumber(found ? found.queueNumber : null);
    } else {
      setQueueNumber(null);
    }
  }, [myQueues, selected]);

  // Listen for custom queue-updated events
  useEffect(() => {
    const handler = () => {
      fetchStations();
      fetchMyQueues();
    };
    window.addEventListener('queue-updated', handler);
    return () => window.removeEventListener('queue-updated', handler);
  }, [fetchStations, fetchMyQueues]);

  // Compute button state
  const buttonConfig = useMemo(() => {
    if (loading) return { label: 'Joining...', disabled: true };
    if (queueNumber !== null) return { label: 'Already in Queue', disabled: true };
    return { label: 'Join Queue', disabled: !selected };
  }, [loading, queueNumber, selected]);

  return (
    <div className="user-queue app-center">
      <div className="container py-4 px-2 px-md-4 relative-position">
        {/* Fallback Polling Indicator */}
        {isUsingFallback && (
          <div className="polling-indicator">
            <span
              className="badge bg-info"
              title="Using fallback polling due to real-time connection issues"
            >
              📡 Polling Mode
            </span>
          </div>
        )}
        
        {/* Notification Bell */}
        <NotificationBell
          notifications={notifications}
          showDropdown={showDropdown}
          bellAnimate={bellAnimate}
          onToggle={toggleDropdown}
          onClear={clearNotifications}
          onAnimationEnd={() => setBellAnimate(false)}
        />

        <h2 className="mb-4">Queue for a Station</h2>
        
        <div className="row mb-3">
          <div className="col-12 col-md-6 mb-2 mb-md-0">
            <label htmlFor="station-select" className="form-label">
              Select a station
            </label>
            <select
              id="station-select"
              className="form-select"
              value={selected}
              onChange={e => setSelected(e.target.value)}
            >
              <option value="">Select a station</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="col-12 col-md-6 d-flex align-items-end justify-content-md-start justify-content-center">
            <button
              type="button"
              className="btn btn-primary btn-lg join-queue-btn-xl ms-md-2 w-100 w-md-auto"
              onClick={joinQueue}
              disabled={buttonConfig.disabled}
            >
              {buttonConfig.label}
            </button>
          </div>
        </div>
        
        {queueNumber && (
          <div className="alert alert-info">
            Your queue number for <b>{selectedStationName}</b>: # <b>{queueNumber}</b>
          </div>
        )}
        
        <h3 className="admin-stations-title mt-4">My Queues</h3>
        
        {lastUpdate && (
          <div className="text-muted small mb-2">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
        
        <div className="table-responsive">
          <table className="table table-bordered table-striped mt-2">
            <thead>
              <tr>
                <th>Station</th>
                <th>Queue Number</th>
              </tr>
            </thead>
            <tbody>
              {myQueues.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-center">
                    You are not in any queues
                  </td>
                </tr>
              ) : (
                myQueues.map(q => (
                  <tr key={q.stationId}>
                    <td>{q.stationName}</td>
                    <td>{q.queueNumber}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserQueue;