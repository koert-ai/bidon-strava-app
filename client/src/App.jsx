import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Connect from './pages/Connect.jsx';
import ClimbConfig from './pages/ClimbConfig.jsx';
import PointsConfig from './pages/PointsConfig.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leaderboard from './pages/Leaderboard.jsx';

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('bidon-dark') === '1');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('bidon-dark', dark ? '1' : '0');
  }, [dark]);

  return (
    <BrowserRouter>
      <nav>
        <img src="/logo.jpg" alt="De Gevulde Bidon" className="nav-logo" />
        <div className="nav-divider" />
        <NavLink to="/">Connect</NavLink>
        <NavLink to="/config/climbs">Climb Config</NavLink>
        <NavLink to="/config/points">Points Config</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/leaderboard">Leaderboard</NavLink>
        <div style={{ marginLeft: 'auto' }}>
          <button
            className="dark-toggle"
            onClick={() => setDark(d => !d)}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Connect />} />
        <Route path="/config/climbs" element={<ClimbConfig />} />
        <Route path="/config/points" element={<PointsConfig />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Routes>
    </BrowserRouter>
  );
}
