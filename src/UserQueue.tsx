import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useEffect, useState, useCallback } from 'react';
import api from './api';
import { initAbly, subscribeToMyQueueUpdates, CHANNEL_NAMES, EVENT_NAMES, subscribeToChannel } from './ablyUtils';

interface Station {
  id: string;
  name: string;
}

interface QueueItem {
  stationId: string;
  stationName: string;
  queueNumber: number;
}

const UserQueue: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [myQueues, setMyQueues] = useState<QueueItem[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Notification bell state
  type Notification = {
    msg: string;
    ts: number;
    type: 'removed' | 'position';
    station: string;
    queueNumber?: number;
  };
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  // Track previous queue state for notification comparison
  const prevQueuesRef = React.useRef<QueueItem[]>([]);
  // Initialize Ably and get userId
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId') || '';
    console.log('UserQueue: Initializing with userId', storedUserId);
    setUserId(storedUserId);

    // Load notifications from localStorage
    const storedNotifs = localStorage.getItem('queueNotifications');
    if (storedNotifs) {
      try {
        setNotifications(JSON.parse(storedNotifs));
      } catch {
        // Ignore JSON parse errors for notifications
      }
    }

    if (storedUserId) {
      const initializeAbly = async () => {
        try {
          const client = await initAbly(storedUserId);
          if (client) {
            console.log('UserQueue: Ably initialized successfully');
          } else {
            console.warn('UserQueue: Ably client is null, real-time updates may not work');
            // Try to reinitialize after a delay
            setTimeout(() => initializeAbly(), 5000);
          }
        } catch (error) {
          console.error('UserQueue: Failed to initialize Ably:', error);
          // Try to reinitialize after a delay
          setTimeout(() => initializeAbly(), 5000);
        }
      };

      initializeAbly();
    }
  }, []);

  const fetchStations = useCallback(async () => {
    console.log('UserQueue: Fetching stations');
    try {
      const res = await api.get<Station[]>('/stations');
      setStations(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Error fetching stations:', error);
      setStations([]);
    }
  }, []);

  const fetchMyQueues = useCallback(async () => {
    if (!userId) return;
    console.log('UserQueue: Fetching my queues for userId', userId);
    
    try {
      const myRes = await api.get<QueueItem[]>('/my-queues');
      console.log('UserQueue: My queues data received:', myRes.data);
      setMyQueues(Array.isArray(myRes.data) ? myRes.data : []);
      setLastUpdate(new Date());
      
      // Update the queue number for the selected station if needed
      if (selected) {
        const found = myRes.data.find(q => q.stationId === selected);
        setQueueNumber(found ? found.queueNumber : null);
      }
    } catch (error) {
      console.error('Error fetching my queues:', error);
      setMyQueues([]);
    }
  }, [userId, selected]);

  useEffect(() => {
    if (userId) {
      fetchStations();
      fetchMyQueues();
    }
  }, [userId, fetchStations, fetchMyQueues]);

  useEffect(() => {
    if (selected) {
      const found = myQueues.find(q => q.stationId === selected);
      setQueueNumber(found ? found.queueNumber : null);
    } else {
      setQueueNumber(null);
    }
  }, [myQueues, selected]);

  // Remove local-only notification logic; now handled in Ably callback

  // Listen for custom 'queue-updated' event to refresh queues
  useEffect(() => {
    const handler = () => {
      fetchStations();
      fetchMyQueues();
    };
    window.addEventListener('queue-updated', handler);
    return () => window.removeEventListener('queue-updated', handler);
  }, [fetchStations, fetchMyQueues]);

  // Subscribe to station updates and my queues via Ably
  useEffect(() => {
    if (!userId) return;
    
    console.log('UserQueue: Setting up Ably subscriptions for userId', userId);
    
    let stationsUnsubscribe: (() => void) = () => {};
    let stationsDeleteUnsubscribe: (() => void) = () => {};
    let myQueuesUnsubscribe: (() => void) = () => {};
    
    const setupSubscriptions = async () => {
      try {
        // Subscribe to station updates (creation, deletion, updates)
        stationsUnsubscribe = await subscribeToChannel(
          CHANNEL_NAMES.STATIONS,
          EVENT_NAMES.STATION_CREATE,
          (data) => {
            console.log('UserQueue: Station created:', data);
            fetchStations();
          }
        );
        
        stationsDeleteUnsubscribe = await subscribeToChannel(
          CHANNEL_NAMES.STATIONS,
          EVENT_NAMES.STATION_DELETE,
          (data) => {
            console.log('UserQueue: Station deleted:', data);
            fetchStations();
          }
        );
        
    // Subscribe to my queue updates
        myQueuesUnsubscribe = await subscribeToMyQueueUpdates(userId, (queueData) => {
          console.log('UserQueue: Received my queues update via Ably:', queueData);
          
          try {
            if (Array.isArray(queueData)) {
              // Validate the data structure
              const validData = queueData.every(item => 
                typeof item === 'object' && 
                'stationId' in item && 
                'stationName' in item && 
                'queueNumber' in item
              );
              
              if (validData) {
                // Notification logic: compare with previous queues
                const prevQueues = prevQueuesRef.current;
                const newNotifs: Notification[] = [];

                prevQueues.forEach(prevQ => {
                  const nowQ = queueData.find((q: QueueItem) => q.stationId === prevQ.stationId);
                  if (!nowQ) {
                    newNotifs.push({
                      msg: `You were removed from "${prevQ.stationName}" queue.`,
                      ts: Date.now(),
                      type: 'removed',
                      station: prevQ.stationName
                    });
                  } else if (nowQ.queueNumber !== prevQ.queueNumber) {
                    newNotifs.push({
                      msg: `Your position in "${nowQ.stationName}" changed to ${nowQ.queueNumber}.`,
                      ts: Date.now(),
                      type: 'position',
                      station: nowQ.stationName,
                      queueNumber: nowQ.queueNumber
                    });
                  }
                });

                prevQueuesRef.current = queueData;

                if (newNotifs.length > 0) {
                  setNotifications(prev => {
                    const updated = [...newNotifs, ...prev].slice(0, 10);
                    localStorage.setItem('queueNotifications', JSON.stringify(updated));
                    return updated;
                  });
                }

                setMyQueues(queueData);
                setLastUpdate(new Date());

                // Update queue number if needed
                if (selected) {
                  const found = queueData.find(q => q.stationId === selected);
                  setQueueNumber(found ? found.queueNumber : null);
                }
              } else {
                console.error('UserQueue: Received queue data with invalid structure:', queueData);
              }
            } else {
              console.error('UserQueue: Received invalid queue data format:', queueData);
            }
          } catch (error) {
            console.error('UserQueue: Error processing queue update:', error);
          }
        });
      } catch (error) {
        console.error('UserQueue: Error setting up subscriptions:', error);
      }
    };
    
    setupSubscriptions();
    
    return () => {
      stationsUnsubscribe();
      stationsDeleteUnsubscribe();
      myQueuesUnsubscribe();
    };
  }, [userId, fetchStations, selected]);

  const joinQueue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      console.log('UserQueue: Joining queue for station', selected);
      const res = await api.post<{ queueNumber: number }>(`/queue/${selected}`);
      setQueueNumber(res.data.queueNumber);
      await fetchMyQueues(); // Still fetch once to ensure UI is updated immediately
    } catch (error) {
      console.error('Error joining queue:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-queue app-center">
      <div className="container py-4 px-2 px-md-4" style={{position: 'relative'}}>
        {/* Notification Bell */}
        <div style={{position: 'absolute', top: 16, right: 24, zIndex: 1100}}>
          <span
            className="notification-bell"
            tabIndex={0}
            onClick={() => {
              setShowDropdown(v => !v);
              // Mark as read (clear badge)
              if (!showDropdown) {
                setTimeout(() => {
                  setNotifications(prev => {
                    localStorage.setItem('queueNotifications', JSON.stringify(prev));
                    return prev;
                  });
                }, 100);
              }
            }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            aria-label="Notifications"
            role="button"
          >
            <span role="img" aria-label="bell">🔔</span>
            {notifications.length > 0 && (
              <span className="notification-badge">{notifications.length}</span>
            )}
          </span>
          {showDropdown && (
            <div className="notification-dropdown">
              <ul>
                {notifications.length === 0 && (
                  <li>No notifications</li>
                )}
                {notifications.map((n, i) => (
                  <li key={n.ts + '-' + i} style={{display: 'flex', alignItems: 'flex-start', gap: '0.5rem'}}>
                    <span style={{fontSize: '1.3em', marginTop: '0.1em'}}>
                      {n.type === 'removed' ? '❌' : n.type === 'position' ? '🔢' : '🔔'}
                    </span>
                    <span>
                      {n.type === 'removed' && (
                        <>
                          Removed from <b>{n.station}</b> queue.
                        </>
                      )}
                      {n.type === 'position' && (
                        <>
                          Position in <b>{n.station}</b> changed to <b>{n.queueNumber}</b>.
                        </>
                      )}
                      <br />
                      <span style={{fontSize: '0.85em', color: '#888'}}>
                        {new Date(n.ts).toLocaleTimeString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div style={{textAlign: 'right', padding: '0.5rem 1rem 0.2rem'}}>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => {
                    setNotifications([]);
                    localStorage.setItem('queueNotifications', '[]');
                  }}
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>
        <h2 className="mb-4">Queue for a Station</h2>
        <div className="row mb-3">
          <div className="col-12 col-md-6 mb-2 mb-md-0">
            <label htmlFor="station-select" className="form-label">Select a station</label>
            <select id="station-select" className="form-select" value={selected} onChange={e => setSelected(e.target.value)}>
              <option value="">Select a station</option>
              {stations.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-6 d-flex align-items-end justify-content-md-start justify-content-center">
            <button
              className="btn btn-primary btn-lg join-queue-btn-xl ms-md-2 w-100 w-md-auto"
              onClick={joinQueue}
              disabled={!selected || loading || queueNumber !== null}
            >
              {loading
                ? 'Joining...'
                : queueNumber !== null
                  ? 'Already in Queue'
                  : 'Join Queue'}
            </button>
          </div>
        </div>        {queueNumber && (
          <div className="alert alert-info">Your queue number: <b>{queueNumber}</b></div>
        )}
        <h3 className="admin-stations-title mt-4">My Queues</h3>
        {lastUpdate && (
          <div className="text-muted small mb-2">Last updated: {lastUpdate.toLocaleTimeString()}</div>
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
              {myQueues.map(q => (
                <tr key={q.stationId}>
                  <td>{q.stationName}</td>
                  <td>{q.queueNumber}</td>
                </tr>
              ))}
              {myQueues.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-center">You are not in any queues</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserQueue;