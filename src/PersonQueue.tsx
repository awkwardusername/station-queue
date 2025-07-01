import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState, useEffect, useCallback } from 'react';
import api from './api';

interface Station { id: string; name: string; }

const PersonQueue: React.FC = () => {
  const [stationId, setStationId] = useState(() => localStorage.getItem('personStationId') || '');
  const [managerId, setManagerId] = useState(() => localStorage.getItem('personManagerId') || '');
  const [queue, setQueue] = useState<{ user_id: string; position: number }[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [popped, setPopped] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);

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
      await fetchQueue();
      // Notify UserQueue to update
      window.dispatchEvent(new Event('queue-updated'));
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

  // Revert to polling for queue updates
  useEffect(() => {
    if (!stationId || !managerId) return;
    const interval = setInterval(() => {
      fetchQueue();
    }, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [fetchQueue, stationId, managerId]);

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