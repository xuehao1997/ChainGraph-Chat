import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';

export default function App() {
  return (
    <div className='app'>
      <Sidebar />
      <Outlet />
    </div>
  );
}
