import 'bootstrap/dist/css/bootstrap.min.css';
import api from './api';
import React, { useState, useEffect } from 'react';

const ADMIN_SECRET = import.meta.env.ADMIN_SECRET;

const AdminPanel: React.FC = () => {
  const [secret, setSecret] = useState('');
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ id: string; name: string; managerId: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<Array<{ id: string; name: string; managerId?: string }>>([]);
  const [refresh, setRefresh] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const savedSecret = localStorage.getItem('adminSecret');
    if (savedSecret) setSecret(savedSecret);
  }, []);

  useEffect(() => {
    if (secret) localStorage.setItem('adminSecret', secret);
  }, [secret]);

  useEffect(() => {
    api.get('/stations').then(res => {
      setStations(Array.isArray(res.data) ? res.data : []);
    });
  }, [refresh]);

  useEffect(() => {
    if (secret === '') {
      setIsAuthenticated(false);
      return;
    }
    // Only check authentication if the secret matches the admin secret from env
    if (secret === ADMIN_SECRET) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, [secret]);

  const createStation = async () => {
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await api.post<{ id: string; name: string; managerId: string }>(
        '/admin/stations',
        { secret, name }
      );
      setResult(res.data);
      setName('');
      setRefresh(r => r + 1);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Error creating station');
    } finally {
      setLoading(false);
    }
  };

  const deleteStation = async (id: string) => {
    setError('');
    setLoading(true);
    try {
      await api.delete(`/admin/stations/${id}`, { headers: { 'x-admin-secret': secret } });
      setRefresh(r => r + 1);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Error deleting station');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-panel app-center">
      <div className="container py-4 px-2 px-md-4">
        <h2 className="mb-4">Admin: Create Station</h2>
        <div className="row mb-3">
          <div className="col-12 col-md-6 mb-2 mb-md-0">
            <input
              className="form-control mb-2"
              placeholder="Admin Secret"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </div>
          <div className="col-12 col-md-6">
            <input
              className="form-control mb-2"
              placeholder="Station Name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!isAuthenticated}
            />
          </div>
        </div>
        {!isAuthenticated ? (
          <div className="alert alert-warning mt-2">Enter the correct admin secret to access the admin panel.</div>
        ) : (
          <>
            <button className="btn btn-primary mb-3 w-100 w-md-auto" onClick={createStation} disabled={loading || !secret || !name}>
              {loading ? 'Creating...' : 'Create Station'}
            </button>
            {error && <div className="alert alert-danger mt-2">{error}</div>}
            {result && (
              <div className="alert alert-success mt-2">
                <div>Station created!</div>
                <div><b>ID:</b> {result.id}</div>
                <div><b>Name:</b> {result.name}</div>
                <div><b>Manager ID:</b> {result.managerId}</div>
              </div>
            )}
            <h3 className="admin-stations-title mt-4">Stations</h3>
            <div className="table-responsive">
              <table className="table table-bordered table-striped mt-2">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Manager ID</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map(station => (
                    <tr key={station.id}>
                      <td>{station.id}</td>
                      <td>{station.name}</td>
                      <td>{station.managerId || '(not available)'} </td>
                      <td>
                        <button className="btn btn-danger btn-sm w-100 w-md-auto" onClick={() => deleteStation(station.id)} disabled={loading || !secret}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;