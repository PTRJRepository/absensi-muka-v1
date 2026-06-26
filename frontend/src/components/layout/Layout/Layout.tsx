import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar';

export function Layout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <Outlet />
      </div>
    </div>
  );
}
