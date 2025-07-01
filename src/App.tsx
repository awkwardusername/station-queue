import { useState, useEffect } from 'react';
import UserQueue from './UserQueue';
import PersonQueue from './PersonQueue';
import AdminPanel from './AdminPanel';
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
          {view === 'user' && <UserQueue />}
          {view === 'person' && <PersonQueue onSwitchView={setView} />}
          {view === 'admin' && <AdminPanel onSwitchView={setView} />}
        </div>
      </div>
    </div>
  );
}

export default App;
