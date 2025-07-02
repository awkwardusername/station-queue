import { useState, useEffect } from 'react';
import { Suspense, lazy } from 'react';
const UserQueue = lazy(() => import('./UserQueue'));
const PersonQueue = lazy(() => import('./PersonQueue'));
const AdminPanel = lazy(() => import('./AdminPanel'));
import { initAbly } from './ablyUtils';
import './App.css';

function App() {
  const [view, setView] = useState<'user' | 'person' | 'admin'>('user');

  // Initialize Ably when app starts
  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (userId) {
      initAbly(userId);
    }
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
    </div>
  );
}

export default App;
