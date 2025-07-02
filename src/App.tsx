import { useState, useEffect } from 'react';
import { Suspense, lazy } from 'react';
const UserQueue = lazy(() => import('./UserQueue'));
const PersonQueue = lazy(() => import('./PersonQueue'));
const AdminPanel = lazy(() => import('./AdminPanel'));
import { initAbly, addConnectionStateListener, removeConnectionStateListener } from './ablyUtils';
import './App.css';
import './ConnectionStatus.css';

function App() {
  const [view, setView] = useState<'user' | 'person' | 'admin'>('user');
  const [connectionState, setConnectionState] = useState<string>('disconnected');

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
      setConnectionState(state);
    };

    addConnectionStateListener(connectionStateListener);

    return () => {
      removeConnectionStateListener(connectionStateListener);
    };
  }, []);

  return (
    <div className="App app-outer-center">
      <div className="app-center">
        <h1 className="text-center py-3">Station Queue Management</h1>
        <nav className="d-flex flex-wrap justify-content-center mb-4 gap-2">
          <button className={`btn btn-outline-primary${view === 'user' ? ' active' : ''}`} onClick={() => setView('user')}>User</button>
          <button className={`btn btn-outline-primary${view === 'person' ? ' active' : ''}`} onClick={() => setView('person')}>Station</button>
          <button className={`btn btn-outline-primary${view === 'admin' ? ' active' : ''}`} onClick={() => setView('admin')}>Admin</button>
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
      <div className="fixed-bottom d-flex justify-content-center" style={{pointerEvents: 'none', zIndex: 1000}}>
        <div className="mb-3" style={{pointerEvents: 'auto'}}>
          <span
            className={`badge connection-status ${
              connectionState === 'connected' ? 'bg-success' :
              connectionState === 'connecting' ? 'bg-warning' :
              'bg-danger'
            }`}
            title={`Real-time connection: ${connectionState}`}
          >
            {connectionState === 'connected' && '🟢 Live'}
            {connectionState === 'connecting' && '🟡 Connecting'}
            {connectionState === 'disconnected' && '🔴 Offline'}
            {connectionState === 'failed' && '🔴 Failed'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default App;
