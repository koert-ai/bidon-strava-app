import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Connect from './pages/Connect.jsx';
import ClimbConfig from './pages/ClimbConfig.jsx';
import PointsConfig from './pages/PointsConfig.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import RiderProfile from './pages/RiderProfile.jsx';
import Riders from './pages/Riders.jsx';
import BidonWeek from './pages/BidonWeek.jsx';
import Goals from './pages/Goals.jsx';

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('bidon-dark') === '1');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('bidon-dark', dark ? '1' : '0');
  }, [dark]);

  // Close mobile menu on nav
  const handleNavClick = () => setMenuOpen(false);

  return (
    <BrowserRouter>
      <nav>
        <img src="/logo.jpg" alt="De Gevulde Bidon" className="nav-logo" />
        <div className="nav-divider" />

        {/* Hamburger for mobile */}
        <button
          className="nav-hamburger"
          onClick={() => setMenuOpen(m => !m)}
          aria-label="Toggle menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>

        <div className={`nav-links${menuOpen ? ' nav-links-open' : ''}`} onClick={handleNavClick}>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/leaderboard">Leaderboard</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/bidon-week">Bidon Week</NavLink>
          <NavLink to="/goals">Goals</NavLink>
          <NavLink to="/riders">Riders</NavLink>
          <NavLink to="/connect">Connect</NavLink>
          <NavLink to="/config/climbs">Climb Config</NavLink>
          <NavLink to="/config/points">Points Config</NavLink>
        </div>

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
        <Route path="/" element={<Home />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/connect" element={<Connect />} />
        <Route path="/config/climbs" element={<ClimbConfig />} />
        <Route path="/config/points" element={<PointsConfig />} />
        <Route path="/riders" element={<Riders />} />
        <Route path="/riders/:riderId" element={<RiderProfile />} />
        <Route path="/bidon-week" element={<BidonWeek />} />
        <Route path="/goals" element={<Goals />} />
      </Routes>
    </BrowserRouter>
  );
}
