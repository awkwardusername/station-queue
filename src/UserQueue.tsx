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
  // Initialize Ably and get userId
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId') || '';
    console.log('UserQueue: Initializing with userId', storedUserId);
    setUserId(storedUserId);
    
    if (storedUserId) {
      const initializeAbly = async () => {
        try {
          await initAbly(storedUserId);
          console.log('UserQueue: Ably initialized successfully');
        } catch (error) {
          console.error('UserQueue: Failed to initialize Ably:', error);
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
          
          if (Array.isArray(queueData)) {
            setMyQueues(queueData);
            setLastUpdate(new Date());
            
            // Update queue number if needed
            if (selected) {
              const found = queueData.find(q => q.stationId === selected);
              setQueueNumber(found ? found.queueNumber : null);
            }
          } else {
            console.error('UserQueue: Received invalid queue data format:', queueData);
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
      <div className="container py-4 px-2 px-md-4">
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
            <button className="btn btn-primary ms-md-2 w-100 w-md-auto" onClick={joinQueue} disabled={!selected || loading}>
              {loading ? 'Joining...' : 'Join Queue'}
            </button>
          </div>
        </div>
        {queueNumber && (
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