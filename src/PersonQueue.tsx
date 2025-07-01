import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState, useEffect, useCallback } from 'react';
import api from './api';
import { initAbly, subscribeToQueueUpdates } from './ablyUtils';

interface Station { id: string; name: string; }

const PersonQueue: React.FC = () => {
  const [stationId, setStationId] = useState(() => localStorage.getItem('personStationId') || '');
  const [managerId, setManagerId] = useState(() => localStorage.getItem('personManagerId') || '');
  const [queue, setQueue] = useState<{ user_id: string; position: number }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [popped, setPopped] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);  // Initialize Ably
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId') || '';
    if (storedUserId) {
      const initializeAbly = async () => {
        try {
          const client = await initAbly(storedUserId);
          if (client) {
            console.log('PersonQueue: Ably initialized successfully');
          } else {
            console.warn('PersonQueue: Ably client is null, real-time updates may not work');
            // Try to reinitialize after a delay
            setTimeout(() => initializeAbly(), 5000);
          }
        } catch (error) {
          console.error('PersonQueue: Failed to initialize Ably:', error);
          // Try to reinitialize after a delay
          setTimeout(() => initializeAbly(), 5000);
        }
      };
      
      initializeAbly();
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    setError('');
    setPopped(null);
    setLoading(true);
    try {
      const res = await api.get<{ queue: { user_id: string; position: number }[] }>(`/queue/${stationId}?managerId=${managerId}`);
      setQueue(res.data.queue);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Error fetching queue');
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, [stationId, managerId]);

  const popQueue = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ popped: string | null }>(`/queue/${stationId}/pop`, { managerId });
      setPopped(res.data.popped);
      // No need to fetch queue manually, Ably will update it
      // But we'll do it once to ensure UI is updated immediately
      await fetchQueue();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Error popping queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (stationId && managerId) {
      fetchQueue();
    } else {
      setQueue([]);
    }
  }, [stationId, managerId, fetchQueue]);

  useEffect(() => {
    api.get<Station[]>('/stations').then(res => {
      setStations(Array.isArray(res.data) ? res.data : []);
    }).catch(() => setStations([]));
  }, []);

  useEffect(() => {
    localStorage.setItem('personStationId', stationId);
  }, [stationId]);

  useEffect(() => {
    localStorage.setItem('personManagerId', managerId);
  }, [managerId]);
  // Subscribe to real-time queue updates
  useEffect(() => {
    if (!stationId || !managerId) return;

    let unsubscribe: (() => void) | undefined;

    // Subscribe to queue updates for this station
    const subscribe = async () => {
      try {
        unsubscribe = await subscribeToQueueUpdates(stationId, (data: unknown) => {
          try {
            console.log('PersonQueue: Received queue update via Ably:', data);
            
            // Type guard to ensure we have the expected data structure
            if (data && typeof data === 'object' && 'queue' in data) {
              const queueData = data as { queue?: { user_id: string; position: number }[] };
              if (Array.isArray(queueData.queue)) {
                // Validate each queue item has the expected structure
                const validData = queueData.queue.every(item => 
                  'user_id' in item && 'position' in item
                );
                
                if (validData) {
                  setQueue(queueData.queue);
                } else {
                  console.error('PersonQueue: Received queue items with invalid structure:', queueData.queue);
                }
              } else {
                console.error('PersonQueue: Queue is not an array:', queueData);
              }
            } else {
              console.error('PersonQueue: Received invalid data format:', data);
            }
          } catch (error) {
            console.error('PersonQueue: Error processing queue update:', error);
          }
        });
      } catch (error) {
        console.error('PersonQueue: Error subscribing to queue updates:', error);
      }
    };
    subscribe();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [stationId, managerId]);

  const stationName = stationId && stations.length > 0 ? (stations.find(s => s.id === stationId)?.name || '') : '';

  return (
    <div className="person-queue app-center">
      <div className="container py-4 px-2 px-md-4">
        <h2 className="mb-4">Manage Station Queue</h2>
        {stationName && (
          <div className="mb-3 text-center">
            <span className="badge bg-info fs-5">Station: {stationName}</span>
          </div>
        )}
        <div className="row mb-3">
          <div className="col-12 col-md-6 mb-2 mb-md-0">
            <input
              className="form-control mb-2"
              placeholder="Station ID"
              value={stationId}
              onChange={e => setStationId(e.target.value)}
            />
          </div>
          <div className="col-12 col-md-6">
            <input
              className="form-control mb-2"
              placeholder="Manager ID"
              value={managerId}
              onChange={e => setManagerId(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary mb-3 w-100 w-md-auto" onClick={fetchQueue} disabled={loading || !stationId || !managerId}>
          {loading ? 'Loading...' : 'View Queue'}
        </button>
        {error && <div className="alert alert-danger mt-2">{error}</div>}
        {queue.length > 0 && (
          <div>
            <h3>Queue</h3>
            {queue[0] && (
              <div className="mb-3 text-center">
                <span className="badge bg-success fs-5">
                  Front of Queue: # {queue[0].position} 
                </span>
              </div>
            )}
            <div className="table-responsive">
              <ol className="list-group list-group-numbered mb-3">
                {queue.map((user, i) => (
                  <li className={`list-group-item${user.position === queue[0].position ? ' list-group-item-success fw-bold' : ''}`} key={(user.user_id ?? 'unknown') + '-' + (user.position ?? i)}>
                    # {user.position}
                  </li>
                ))}
              </ol>
            </div>
            <button className="btn btn-warning w-100 w-md-auto" onClick={popQueue} disabled={loading}>Pop Queue</button>
          </div>
        )}
        {popped && <div className="alert alert-info mt-2">Popped user: {popped}</div>}
      </div>
    </div>
  );
};

export default PersonQueue;