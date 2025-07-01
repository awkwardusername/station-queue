import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useEffect, useState } from 'react';
import api from './api';

interface Station {
  id: string;
  name: string;
}

const UserQueue: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [myQueues, setMyQueues] = useState<{ stationId: string; stationName: string; queueNumber: number }[]>([]);

  const fetchMyQueues = async () => {
    try {
      const myRes = await api.get<{ stationId: string; stationName: string; queueNumber: number }[]>('/my-queues');
      setMyQueues(Array.isArray(myRes.data) ? myRes.data : []);
    } catch {
      setMyQueues([]);
    }
  };

  useEffect(() => {
    api.get<Station[]>('/stations').then(res => {
      const data = Array.isArray(res.data) ? res.data : [];
      setStations(data);
    }).catch(() => setStations([]));
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchMyQueues, 2000);
    fetchMyQueues();
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (selected) {
      const found = myQueues.find(q => q.stationId === selected);
      setQueueNumber(found ? found.queueNumber : null);
    } else {
      setQueueNumber(null);
    }
  }, [myQueues, selected]);

  const joinQueue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await api.post<{ queueNumber: number }>(`/queue/${selected}`);
      setQueueNumber(res.data.queueNumber);
      await fetchMyQueues();
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserQueue;