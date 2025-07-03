import 'bootstrap/dist/css/bootstrap.min.css';
import api from './api';
import React, { useState, useEffect } from 'react';
import { initAbly, subscribeToChannel, CHANNEL_NAMES, EVENT_NAMES } from './ablyUtils';

const ADMIN_SECRET_KEY = 'adminSecret';

interface AdminPanelProps {
  onSwitchView?: (view: 'user' | 'person' | 'admin') => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onSwitchView }) => {
  const [secret, setSecret] = useState(() => {
    // Initialize from localStorage if available
    return localStorage.getItem(ADMIN_SECRET_KEY) || '';
  });
  
  // Update localStorage when secret changes
  const handleSecretChange = (value: string) => {
    setSecret(value);
    // If the user is authenticated, save the new secret
    if (isAuthenticated) {
      localStorage.setItem(ADMIN_SECRET_KEY, value);
    }
  };
  const [name, setName] = useState('');
  const [result, setResult] = useState<{ id: string; name: string; managerId: string } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<Array<{ id: string; name: string; managerId?: string }>>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // Initialize Ably and check for saved admin secret
  useEffect(() => {
    const userId = localStorage.getItem('userId') || '';
    if (userId) {
      const initializeAbly = async () => {
        try {
          await initAbly(userId);
        } catch (error) {
          console.error('Error initializing Ably:', error);
        }
      };
      
      initializeAbly();
    }
    
    // Try to authenticate with saved admin secret if it exists
    const savedSecret = localStorage.getItem(ADMIN_SECRET_KEY);
    if (savedSecret) {
      const autoAuthenticate = async () => {
        setLoading(true);
        try {
          await api.get('/stations', { headers: { 'x-admin-secret': savedSecret } });
          setIsAuthenticated(true);
          fetchStations(savedSecret);
        } catch (error) {
          console.error('Auto-authentication failed:', error);
          // If authentication fails, clear the stored secret
          localStorage.removeItem(ADMIN_SECRET_KEY);
          setIsAuthenticated(false);
          setSecret('');
        } finally {
          setLoading(false);
        }
      };
      
      autoAuthenticate();
    }
  }, []);

  // Fetch stations only when authenticated or after create/delete
  const fetchStations = async (adminSecret: string) => {
    try {
      const res = await api.get('/stations', { headers: { 'x-admin-secret': adminSecret } });
      setStations(Array.isArray(res.data) ? res.data : []);
    } catch {
      setIsAuthenticated(false);
    }
  };  const tryAuthenticate = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.get('/stations', { headers: { 'x-admin-secret': secret } });
      // Authentication successful, save to localStorage
      localStorage.setItem(ADMIN_SECRET_KEY, secret);
      setIsAuthenticated(true);
      setSuccess('Login successful! Admin credentials saved.');
      fetchStations(secret);
    } catch {
      setIsAuthenticated(false);
      setError('Invalid admin secret');
      // Clear any stored secret on failed authentication
      localStorage.removeItem(ADMIN_SECRET_KEY);
    } finally {
      setLoading(false);
    }
  };
  const createStation = async () => {
    setError('');
    setSuccess('');
    setResult(null);
    setLoading(true);
    try {
      const trimmedName = name.trim();
      if (!trimmedName) {
        setError('Station name cannot be empty or whitespace.');
        setLoading(false);
        return;
      }
      const res = await api.post<{ id: string; name: string; managerId: string }>(
        '/admin/stations',
        { name: trimmedName },
        { headers: { 'x-admin-secret': secret } }
      );
      setResult(res.data);
      setName('');
      await fetchStations(secret);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Error creating station');
      if (err.response?.data?.error === 'Forbidden') {
        setIsAuthenticated(false);
        localStorage.removeItem(ADMIN_SECRET_KEY); // Clear stored secret on authentication failure
      }
    } finally {
      setLoading(false);
    }
  };  const deleteStation = async (id: string) => {
    // Ask for confirmation before deleting
    const stationToDelete = stations.find(s => s.id === id);
    const confirmDelete = window.confirm(`Are you sure you want to delete station "${stationToDelete?.name || id}"?\nThis action cannot be undone.`);
    
    if (!confirmDelete) {
      return; // User cancelled the deletion
    }
    
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.delete(`/admin/stations/${id}`, { headers: { 'x-admin-secret': secret } });
      setSuccess('Station deleted successfully');
      await fetchStations(secret);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Error deleting station');
      if (err.response?.data?.error === 'Forbidden') {
        setIsAuthenticated(false);
        localStorage.removeItem(ADMIN_SECRET_KEY); // Clear stored secret on authentication failure
      }
    } finally {
      setLoading(false);
    }
  };
    // Function to handle managing a station
  const manageStation = (stationId: string, managerId: string | undefined) => {
    if (!managerId) {
      setError('Manager ID not available for this station');
      return;
    }
    
    try {
      // Clear previous error/success messages
      setError('');
      setSuccess('');
      
      // Store station ID and manager ID in localStorage
      localStorage.setItem('personStationId', stationId);
      localStorage.setItem('personManagerId', managerId);
      
      // Show success message briefly before switching views
      setSuccess(`Station selected. Switching to management view...`);
      
      // Switch to the Person view after a brief delay to show the message
      setTimeout(() => {
        if (onSwitchView) {
          onSwitchView('person');
        }
      }, 500);
    } catch (err) {
      setError('Failed to set station data for management view');
      console.error('Error setting station data:', err);
    }
  };

  // Subscribe to station updates
  useEffect(() => {
    if (!isAuthenticated) return;
    
    let createUnsubscribe: (() => void) = () => {};
    let deleteUnsubscribe: (() => void) = () => {};
    
    const setupSubscriptions = async () => {
      try {
        // Subscribe to station creation
        createUnsubscribe = await subscribeToChannel(
          CHANNEL_NAMES.STATIONS,
          EVENT_NAMES.STATION_CREATE,
          () => fetchStations(secret)
        );
        
        // Subscribe to station deletion
        deleteUnsubscribe = await subscribeToChannel(
          CHANNEL_NAMES.STATIONS,
          EVENT_NAMES.STATION_DELETE,
          () => fetchStations(secret)
        );
      } catch (error) {
        console.error('Error setting up subscriptions:', error);
      }
    };
    
    setupSubscriptions();
    
    return () => {
      createUnsubscribe();
      deleteUnsubscribe();
    };
  }, [isAuthenticated, secret]);
  if (!isAuthenticated) {
    return (
      <div className="admin-panel app-center">
        <div className="container py-4 px-2 px-md-4">
          <h2 className="mb-4">Admin Login</h2>
          <div className="row mb-3">
            <div className="col-12 col-md-6 mb-2 mb-md-0">              <input
                className="form-control mb-2"
                placeholder="Admin Secret"
                value={secret}
                onChange={e => handleSecretChange(e.target.value)}
                type="password"
                autoComplete="current-password"
                onKeyDown={e => { if (e.key === 'Enter') tryAuthenticate(); }}
              />
            </div>
            <div className="col-12 col-md-6 d-flex align-items-end">
              <button className="btn btn-primary w-100 w-md-auto" onClick={tryAuthenticate} disabled={loading || !secret}>
                {loading ? 'Checking...' : 'Unlock Admin'}
              </button>
            </div>
          </div>
          {error && <div className="alert alert-danger mt-2">{error}</div>}
        </div>
      </div>
    );
  }
  // Function to handle logout
  const handleLogout = () => {
    localStorage.removeItem(ADMIN_SECRET_KEY);
    setIsAuthenticated(false);
    setSecret('');
  };

  return (
    <div className="admin-panel app-center">
      <div className="container py-4 px-2 px-md-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2>Admin: Create Station</h2>
          <button 
            className="btn btn-outline-danger" 
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
        <div className="row mb-3">
          <div className="col-12 col-md-6 mb-2 mb-md-0">
            {/* Admin Secret input hidden when authenticated */}
          </div>
          <div className="col-12 col-md-6">
            <input
              className="form-control mb-2"
              placeholder="Station Name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary mb-3 w-100 w-md-auto" onClick={createStation} disabled={loading || !secret || !name}>
          {loading ? 'Creating...' : 'Create Station'}
        </button>
  
        
        {error && <div className="alert alert-danger mt-2">{error}</div>}
        {success && <div className="alert alert-success mt-2">{success}</div>}
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
            <thead>              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Manager ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>              {stations.map(station => (
                <tr key={station.id}>
                  <td>{station.id}</td>
                  <td>{station.name}</td>
                  <td>{station.managerId || '(not available)'} </td>
                  <td>
                    <div className="d-flex gap-2 flex-wrap">                      <button 
                        className="btn btn-primary btn-sm" 
                        onClick={() => manageStation(station.id, station.managerId)}
                        disabled={!station.managerId}
                        title={station.managerId ? "Manage this station" : "Manager ID not available"}
                      >
                        Manage
                      </button>
                      <button 
                        className="btn btn-danger btn-sm" 
                        onClick={() => deleteStation(station.id)} 
                        disabled={loading || !secret}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;