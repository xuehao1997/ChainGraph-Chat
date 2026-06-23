import { NavLink } from 'react-router-dom';

const navItems = [
  {
    to: '/event-source',
    title: '原生 EventSource',
    desc: 'EventSource + SSEClient',
  },
  {
    to: '/fetch-event-source',
    title: 'fetch-event-source',
    desc: '微软库 + 节流',
  },
];

export default function Sidebar() {
  return (
    <aside className='sidebar'>
      <div className='brand'>
        <div className='brand-logo'>SB</div>
        <div>
          <div className='brand-name'>StreamBench</div>
          <div className='brand-sub'>SSE 测试台</div>
        </div>
      </div>

      <nav className='nav'>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'active' : ''}`
            }
          >
            <span className='nav-item-title'>{item.title}</span>
            <span className='nav-item-desc'>{item.desc}</span>
          </NavLink>
        ))}
      </nav>

      <div className='sidebar-footer'>
        后端 Express 接 DeepSeek
        <br />
        两种 SSE 方案对比测试
      </div>
    </aside>
  );
}
