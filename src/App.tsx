import { useState, useEffect, useMemo } from 'react';
import { Suspense, lazy } from 'react';
const UserQueue = lazy(() => import('./UserQueue'));
const PersonQueue = lazy(() => import('./PersonQueue'));
const AdminPanel = lazy(() => import('./AdminPanel'));
import { initAbly, addConnectionStateListener, removeConnectionStateListener } from './ablyUtils';
import './App.css';
import './ConnectionStatus.css';

// Connection status configuration
const CONNECTION_STATUS_CONFIG = {
  connected: {
    icon: '🟢',
    text: 'Live',
    className: 'bg-success',
    ariaLabel: 'Connected to real-time service'
  },
  connecting: {
    icon: '🟡',
    text: 'Connecting',
    className: 'bg-warning',
    ariaLabel: 'Connecting to real-time service'
  },
  disconnected: {
    icon: '🔴',
    text: 'Offline',
    className: 'bg-danger',
    ariaLabel: 'Disconnected from real-time service'
  },
  failed: {
    icon: '🔴',
    text: 'Failed',
    className: 'bg-danger',
    ariaLabel: 'Failed to connect to real-time service'
  }
} as const;

type ConnectionState = keyof typeof CONNECTION_STATUS_CONFIG;

function App() {
  const [view, setView] = useState<'user' | 'person' | 'admin'>('user');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  // Initialize Ably when app starts
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (userId) {
      initAbly(userId);
    }
  }, []);

  // Monitor connection state globally
  useEffect(() => {
    const connectionStateListener = (state: string) => {
      console.log('App: Connection state changed to:', state);
      // Validate state before setting
      if (state in CONNECTION_STATUS_CONFIG) {
        setConnectionState(state as ConnectionState);
      } else {
        console.warn(`Unknown connection state: ${state}, defaulting to 'disconnected'`);
        setConnectionState('disconnected');
      }
    };

    addConnectionStateListener(connectionStateListener);

    return () => {
      removeConnectionStateListener(connectionStateListener);
    };
  }, []);

  // Memoize connection status configuration to prevent unnecessary re-renders
  const connectionStatusInfo = useMemo(() => {
    return CONNECTION_STATUS_CONFIG[connectionState] || CONNECTION_STATUS_CONFIG.disconnected;
  }, [connectionState]);

  return (
    <div className="App app-outer-center">
      <div className="app-center">
        <h1 className="text-center py-3">Station Queue Management</h1>
        <nav className="d-flex flex-wrap justify-content-center mb-4 gap-2">
          <button type="button" className={`btn btn-outline-primary${view === 'user' ? ' active' : ''}`} onClick={() => setView('user')}>User</button>
          <button type="button" className={`btn btn-outline-primary${view === 'person' ? ' active' : ''}`} onClick={() => setView('person')}>Station</button>
          <button type="button" className={`btn btn-outline-primary${view === 'admin' ? ' active' : ''}`} onClick={() => setView('admin')}>Admin</button>
        </nav>
        <div className="w-100">
          <Suspense fallback={<div>Loading...</div>}>
            {view === 'user' && <UserQueue />}
            {view === 'person' && <PersonQueue onSwitchView={setView} />}
            {view === 'admin' && <AdminPanel onSwitchView={setView} />}
          </Suspense>
        </div>
      </div>
      
      {/* Global Connection Status Footer */}
      <div
        className="connection-status-footer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="connection-status-container">
          <span
            className={`badge connection-status ${connectionStatusInfo.className}`}
            title={`Real-time connection: ${connectionState}`}
            aria-label={connectionStatusInfo.ariaLabel}
          >
            <span aria-hidden="true">{connectionStatusInfo.icon}</span>
            <span className="ms-1">{connectionStatusInfo.text}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
