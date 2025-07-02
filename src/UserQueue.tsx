import 'bootstrap/dist/css/bootstrap.min.css';
import './ConnectionStatus.css';
import React, { useEffect, useState, useCallback } from 'react';
import api from './api';
import { initAbly, subscribeToMyQueueUpdates, CHANNEL_NAMES, EVENT_NAMES, subscribeToChannel, addConnectionStateListener, removeConnectionStateListener } from './ablyUtils';
import { createMyQueuesPoller, createStationsPoller, POLLING_INTERVALS } from './fallbackPolling';
import { v4 as uuidv4 } from 'uuid';
interface Station {
  id: string;
  name: string;
}

interface QueueItem {
  stationId: string;
  stationName: string;
  queueNumber: number;
  actualPosition?: number;
}

const UserQueue: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [myQueues, setMyQueues] = useState<QueueItem[]>([]);
  const [userId, setUserId] = useState<string>('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Fallback polling state
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  // Notification bell state
  type Notification = {
    msg: string;
    ts: number;
    type: 'removed' | 'position';
    station: string;
    queueNumber?: number;
    prevQueueNumber?: number;
  };
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [bellAnimate, setBellAnimate] = useState(false);
  // Track previous queue state for notification comparison
  const prevQueuesRef = React.useRef<QueueItem[]>([]);
  // Fallback polling instances
  const myQueuesPollerRef = React.useRef<ReturnType<typeof createMyQueuesPoller> | null>(null);
  const stationsPollerRef = React.useRef<ReturnType<typeof createStationsPoller> | null>(null);

  // Initialize Ably and get userId
  useEffect(() => {
    let storedUserId = localStorage.getItem('userId');
    
    // Generate a new userId if one doesn't exist
    if (!storedUserId) {
      storedUserId = uuidv4();
      localStorage.setItem('userId', storedUserId);
      console.log('UserQueue: Generated new userId:', storedUserId);
    }
    
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

  // Fallback polling management based on connection state
  useEffect(() => {
    if (!userId) return;

    const connectionStateListener = (state: string) => {
      console.log('UserQueue: Connection state changed to:', state);

      // Manage fallback polling based on connection state
      if (state === 'connected') {
        // Real-time is working, stop fallback polling
        if (myQueuesPollerRef.current?.isActive()) {
          console.log('UserQueue: Stopping fallback polling - real-time connected');
          myQueuesPollerRef.current.stop();
          stationsPollerRef.current?.stop();
          setIsUsingFallback(false);
        }
      } else if (state === 'failed' || state === 'disconnected') {
        // Real-time is not working, start fallback polling
        if (!myQueuesPollerRef.current?.isActive()) {
          console.log('UserQueue: Starting fallback polling - real-time failed');
          
          // Create and start my queues poller
          myQueuesPollerRef.current = createMyQueuesPoller(
            (queues) => {
              console.log('UserQueue: Fallback polling - received queues:', queues);
              
              // Apply the same notification logic as Ably callback
              const prevQueues = prevQueuesRef.current;
              let skipFirst = false;
              if (prevQueues.length === 0) {
                // First update, just set ref and skip notifications
                skipFirst = true;
                prevQueuesRef.current = queues;
              }
              const newNotifs: Notification[] = [];

              if (!skipFirst) {
                prevQueues.forEach(prevQ => {
                  const nowQ = queues.find((q: QueueItem) => q.stationId === prevQ.stationId);
                  if (!nowQ) {
                    newNotifs.push({
                      msg: `You were removed from "${prevQ.stationName}" queue (was position ${prevQ.queueNumber}).`,
                      ts: Date.now(),
                      type: 'removed',
                      station: prevQ.stationName,
                      prevQueueNumber: prevQ.queueNumber
                    });
                  } else if (nowQ.queueNumber !== prevQ.queueNumber) {
                    const actualPosition = calculateActualPosition(queues, nowQ.stationId, nowQ.queueNumber);
                    newNotifs.push({
                      msg: `Your position in "${nowQ.stationName}" changed to ${actualPosition} in line.`,
                      ts: Date.now(),
                      type: 'position',
                      station: nowQ.stationName,
                      queueNumber: actualPosition
                    });
                  }
                });

                if (newNotifs.length > 0) {
                  setNotifications(prev => {
                    const updated = [...newNotifs, ...prev].slice(0, 10);
                    localStorage.setItem('queueNotifications', JSON.stringify(updated));
                    return updated;
                  });
                  // Animate bell and play sound
                  setBellAnimate(true);
                  console.log('UserQueue: Playing notification sound and animating bell');
                  
                  // Play sound (simple beep) with better error handling
                  try {
                    // Check if AudioContext is supported
                    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                    if (AudioContextClass) {
                      const ctx = new AudioContextClass();
                      const o = ctx.createOscillator();
                      const g = ctx.createGain();
                      o.type = 'sine';
                      o.frequency.value = 1200;
                      g.gain.value = 0.08;
                      o.connect(g);
                      g.connect(ctx.destination);
                      o.start();
                      o.stop(ctx.currentTime + 0.18);
                      o.onended = () => {
                        try {
                          ctx.close();
                        } catch {
                          // Ignore close errors
                        }
                      };
                    } else {
                      console.warn('AudioContext not supported, skipping notification sound');
                    }
                  } catch (audioError) {
                    console.warn('Could not play notification sound:', audioError);
                  }
                }
                prevQueuesRef.current = queues;
              }

              setMyQueues(queues);
              setLastUpdate(new Date());
              
              // Update queue number for selected station
              if (selected) {
                const found = queues.find(q => q.stationId === selected);
                setQueueNumber(found ? found.queueNumber : null);
              }
            },
            (error) => {
              console.error('UserQueue: Fallback polling error:', error);
            }
          );

          // Create and start stations poller
          stationsPollerRef.current = createStationsPoller(
            (stations) => {
              console.log('UserQueue: Fallback polling - received stations:', stations);
              setStations(stations);
            },
            (error) => {
              console.error('UserQueue: Stations fallback polling error:', error);
            }
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
      // Clean up pollers
      if (myQueuesPollerRef.current) {
        myQueuesPollerRef.current.stop();
      }
      if (stationsPollerRef.current) {
        stationsPollerRef.current.stop();
      }
    };
  }, [userId, selected]);

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

  // Helper function to calculate actual position in line for a queue
  const calculateActualPosition = (queues: QueueItem[], targetStationId: string, targetQueueNumber: number): number => {
    const stationQueues = queues.filter(q => q.stationId === targetStationId);
    const sortedQueues = stationQueues.sort((a, b) => a.queueNumber - b.queueNumber);
    return sortedQueues.findIndex(q => q.queueNumber === targetQueueNumber) + 1;
  };

  const fetchMyQueues = useCallback(async () => {
    if (!userId) return;
    console.log('UserQueue: Fetching my queues for userId', userId);
    
    try {
      const myRes = await api.get<QueueItem[]>('/my-queues');
      console.log('UserQueue: My queues data received:', myRes.data);
      const newQueueData = Array.isArray(myRes.data) ? myRes.data : [];
      
      // Apply notification logic here too (in case Ably updates are missed)
      const prevQueues = prevQueuesRef.current;
      console.log('UserQueue: fetchMyQueues notification check - Previous:', prevQueues, 'Current:', newQueueData);
      
      if (prevQueues.length > 0) {
        const newNotifs: Notification[] = [];
        
        // Check for removed queues (user was popped or left)
        prevQueues.forEach(prevQ => {
          const nowQ = newQueueData.find((q: QueueItem) => q.stationId === prevQ.stationId);
          if (!nowQ) {
            console.log('UserQueue: fetchMyQueues - User removed from queue:', prevQ);
            newNotifs.push({
              msg: `You were removed from "${prevQ.stationName}" queue (was position ${prevQ.queueNumber}).`,
              ts: Date.now(),
              type: 'removed',
              station: prevQ.stationName,
              prevQueueNumber: prevQ.queueNumber
            });
          }
        });

        // Check for position changes using actualPosition from API
        newQueueData.forEach((nowQ: QueueItem) => {
          const prevQ = prevQueues.find(p => p.stationId === nowQ.stationId);
          if (prevQ) {
            const currentActualPosition = nowQ.actualPosition || calculateActualPosition(newQueueData, nowQ.stationId, nowQ.queueNumber);
            const prevActualPosition = prevQ.actualPosition || calculateActualPosition(prevQueues, prevQ.stationId, prevQ.queueNumber);
            
            console.log(`UserQueue: fetchMyQueues - Station ${nowQ.stationId}: Position number ${prevQ.queueNumber} -> ${nowQ.queueNumber}, Actual position ${prevActualPosition} -> ${currentActualPosition}`);
            
            // Detect any change in actual queue position
            if (currentActualPosition !== prevActualPosition) {
              if (currentActualPosition < prevActualPosition) {
                // Moved up
                console.log('UserQueue: fetchMyQueues - User moved up in line:', prevActualPosition, '->', currentActualPosition);
                newNotifs.push({
                  msg: `You moved up in "${nowQ.stationName}" queue! Now position ${currentActualPosition} in line.`,
                  ts: Date.now(),
                  type: 'position',
                  station: nowQ.stationName,
                  queueNumber: currentActualPosition
                });
              } else {
                // Moved down
                console.log('UserQueue: fetchMyQueues - User moved down in line:', prevActualPosition, '->', currentActualPosition);
                newNotifs.push({
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

        if (newNotifs.length > 0) {
          console.log('UserQueue: fetchMyQueues - Generated notifications:', newNotifs);
          setNotifications(prev => {
            const updated = [...newNotifs, ...prev].slice(0, 10);
            localStorage.setItem('queueNotifications', JSON.stringify(updated));
            return updated;
          });
          // Animate bell and play sound
          setBellAnimate(true);
          console.log('UserQueue: Playing notification sound and animating bell (fetchMyQueues)');
          
          // Play sound
          try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (AudioContextClass) {
              const ctx = new AudioContextClass();
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = 'sine';
              o.frequency.value = 1200;
              g.gain.value = 0.08;
              o.connect(g);
              g.connect(ctx.destination);
              o.start();
              o.stop(ctx.currentTime + 0.18);
              o.onended = () => {
                try {
                  ctx.close();
                } catch {
                  // Ignore close errors
                }
              };
            }
          } catch (audioError) {
            console.warn('Could not play notification sound:', audioError);
          }
        }
        
        prevQueuesRef.current = newQueueData;
      } else {
        // First time, just set the ref
        prevQueuesRef.current = newQueueData;
      }
      
      setMyQueues(newQueueData);
      setLastUpdate(new Date());
      
      // Update the queue number for the selected station if needed
      if (selected) {
        const found = newQueueData.find(q => q.stationId === selected);
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
    const queuePopUnsubscribes: (() => void)[] = [];
    
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

        // Subscribe to queue pop events - this helps us immediately know when someone was popped
        // even before the personal queue updates arrive
        if (stations.length > 0) {
          for (const station of stations) {
            const unsubscribe = await subscribeToChannel(
              CHANNEL_NAMES.QUEUE(station.id),
              EVENT_NAMES.QUEUE_POP,
              (data: unknown) => {
                console.log('UserQueue: Queue pop event received for station', station.id, ':', data);
                // Immediately refresh my queues when someone is popped from any queue
                fetchMyQueues();
              }
            );
            queuePopUnsubscribes.push(unsubscribe);
          }
        }
        
    // Subscribe to my queue updates
    myQueuesUnsubscribe = await subscribeToMyQueueUpdates(userId, (queueData) => {
      console.log('UserQueue: Received my queues update via Ably for userId:', userId, 'data:', queueData);
          
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
                console.log('UserQueue: Comparing queues - Previous:', prevQueues, 'Current:', queueData);
                
                let skipFirst = false;
                if (prevQueues.length === 0) {
                  // First update, just set ref and skip notifications
                  skipFirst = true;
                  console.log('UserQueue: First queue update, skipping notifications');
                  prevQueuesRef.current = queueData;
                }
                const newNotifs: Notification[] = [];

                if (!skipFirst) {
                  console.log('UserQueue: Processing notifications - prevQueues:', prevQueues, 'newQueues:', queueData);
                  
                  // Check for removed queues (user was popped or left)
                  prevQueues.forEach(prevQ => {
                    const nowQ = queueData.find((q: QueueItem) => q.stationId === prevQ.stationId);
                    if (!nowQ) {
                      console.log('UserQueue: User removed from queue:', prevQ);
                      newNotifs.push({
                        msg: `You were removed from "${prevQ.stationName}" queue (was position ${prevQ.queueNumber}).`,
                        ts: Date.now(),
                        type: 'removed',
                        station: prevQ.stationName,
                        prevQueueNumber: prevQ.queueNumber
                      });
                    }
                  });

                  // Simple approach: Check if any queue in the same station got shorter
                  // (this indicates someone was removed from that station's queue)
                  queueData.forEach((nowQ: QueueItem) => {
                    const prevQ = prevQueues.find(p => p.stationId === nowQ.stationId);
                    if (prevQ) {
                      console.log(`UserQueue: Checking station ${nowQ.stationId} - prev: ${prevQ.queueNumber}, now: ${nowQ.queueNumber}`);
                      
                      // Use actual positions from API or fallback to calculation
                      const currentActualPosition = nowQ.actualPosition || calculateActualPosition(queueData, nowQ.stationId, nowQ.queueNumber);
                      const prevActualPosition = prevQ.actualPosition || calculateActualPosition(prevQueues, prevQ.stationId, prevQ.queueNumber);
                      
                      console.log(`UserQueue: Station ${nowQ.stationId} - Position number: ${prevQ.queueNumber} -> ${nowQ.queueNumber}, Actual position: ${prevActualPosition} -> ${currentActualPosition}`);
                      
                      // Check for any improvement in actual queue position (even if position number stays same)
                      if (currentActualPosition < prevActualPosition) {
                        // Moved up in line
                        console.log('UserQueue: User moved up in line:', prevActualPosition, '->', currentActualPosition);
                        newNotifs.push({
                          msg: `You moved up in "${nowQ.stationName}" queue! Now position ${currentActualPosition} in line.`,
                          ts: Date.now(),
                          type: 'position',
                          station: nowQ.stationName,
                          queueNumber: currentActualPosition
                        });
                      } else if (currentActualPosition > prevActualPosition) {
                        // Moved down in line (someone joined ahead)
                        console.log('UserQueue: User moved down in line:', prevActualPosition, '->', currentActualPosition);
                        newNotifs.push({
                          msg: `Your position in "${nowQ.stationName}" changed to ${currentActualPosition} in line.`,
                          ts: Date.now(),
                          type: 'position',
                          station: nowQ.stationName,
                          queueNumber: currentActualPosition
                        });
                      }
                    }
                  });

                  console.log('UserQueue: Generated notifications:', newNotifs);

                  if (newNotifs.length > 0) {
                    console.log('UserQueue: Generated notifications:', newNotifs);
                    setNotifications(prev => {
                      const updated = [...newNotifs, ...prev].slice(0, 10);
                      localStorage.setItem('queueNotifications', JSON.stringify(updated));
                      return updated;
                    });
                    // Animate bell and play sound
                    setBellAnimate(true);
                    console.log('UserQueue: Playing notification sound and animating bell (Ably)');
                    
                    // Play sound (simple beep) with better error handling
                    try {
                      // Check if AudioContext is supported
                      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                      if (AudioContextClass) {
                        const ctx = new AudioContextClass();
                        const o = ctx.createOscillator();
                        const g = ctx.createGain();
                        o.type = 'sine';
                        o.frequency.value = 1200;
                        g.gain.value = 0.08;
                        o.connect(g);
                        g.connect(ctx.destination);
                        o.start();
                        o.stop(ctx.currentTime + 0.18);
                        o.onended = () => {
                          try {
                            ctx.close();
                          } catch {
                            // Ignore close errors
                          }
                        };
                      } else {
                        console.warn('AudioContext not supported, skipping notification sound');
                      }
                    } catch (audioError) {
                      console.warn('Could not play notification sound:', audioError);
                    }
                  } else {
                    console.log('UserQueue: No notifications to show');
                  }
                  
                  prevQueuesRef.current = queueData;
                } else {
                  // Still update the ref even for first load
                  prevQueuesRef.current = queueData;
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
      queuePopUnsubscribes.forEach(unsub => unsub());
    };
  }, [userId, fetchStations, fetchMyQueues, stations, selected]);

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
        {/* Fallback Polling Indicator - only show when polling is active */}
        {isUsingFallback && (
          <div style={{position: 'absolute', top: 16, left: 24, zIndex: 1000}}>
            <span
              className="badge bg-info"
              title="Using fallback polling due to real-time connection issues"
            >
              📡 Polling Mode
            </span>
          </div>
        )}
        
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
            <span
              role="img"
              aria-label="bell"
              className={bellAnimate ? 'bell-animate' : ''}
              onAnimationEnd={() => setBellAnimate(false)}
            >🔔</span>
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
                          Removed from <b>{n.station}</b> queue
                          {typeof n.prevQueueNumber === 'number' && (
                            <> (was position <b>{n.prevQueueNumber}</b>)</>
                          )}
                          .
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
        
        {/* Footer with Test Button */}
        <div className="mt-4 text-center border-top pt-3">
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              // Test notification
              const testNotification: Notification = {
                msg: 'This is a test notification!',
                ts: Date.now(),
                type: 'position',
                station: 'Test Station',
                queueNumber: 1
              };
              
              setNotifications(prev => {
                const updated = [testNotification, ...prev].slice(0, 10);
                localStorage.setItem('queueNotifications', JSON.stringify(updated));
                return updated;
              });
              
              setBellAnimate(true);
              console.log('Test notification created');
              
              // Play test sound
              try {
                const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                if (AudioContextClass) {
                  const ctx = new AudioContextClass();
                  const o = ctx.createOscillator();
                  const g = ctx.createGain();
                  o.type = 'sine';
                  o.frequency.value = 1200;
                  g.gain.value = 0.08;
                  o.connect(g);
                  g.connect(ctx.destination);
                  o.start();
                  o.stop(ctx.currentTime + 0.18);
                  o.onended = () => {
                    try {
                      ctx.close();
                    } catch {
                      // Ignore close errors
                    }
                  };
                } else {
                  console.warn('AudioContext not supported, skipping test sound');
                }
              } catch (audioError) {
                console.warn('Could not play test sound:', audioError);
              }
            }}
            title="Test notification system"
          >
            🧪 Test Notifications
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserQueue;