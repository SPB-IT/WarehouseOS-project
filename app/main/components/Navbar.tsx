'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    href: '/main',
    label: 'ภาพรวม',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    href: '/main/deposit',
    label: 'รับฝากสินค้า',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="12 22.08 12 12"/><line x1="3.27" y1="6.96" x2="12" y2="12.04"/><line x1="20.73" y1="6.96" x2="12" y2="12.04"/>
      </svg>
    ),
  },
  {
    href: '/main/inventory',
    label: 'รายการคลัง',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: '/main/withdraw',
    label: 'คืนสินค้า',
    icon: (
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
        <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
      </svg>
    ),
  },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <>
      <style>{`
        .wh-nav {
          position: sticky; top: 0; z-index: 100;
          background: #0d1117;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          font-family: 'Sarabun', 'Noto Sans Thai', sans-serif;
        }
        .wh-nav-inner {
          max-width: 1280px; margin: 0 auto;
          padding: 0 1.5rem; height: 58px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .wh-logo {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none; user-select: none;
        }
        .wh-logo-mark {
          width: 32px; height: 32px; border-radius: 8px;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          display: flex; align-items: center; justify-content: center;
        }
        .wh-logo-mark svg { color: white; }
        .wh-logo-text { font-size: 16px; font-weight: 700; color: #f1f5f9; letter-spacing: -0.3px; }
        .wh-logo-sub { font-size: 11px; color: rgba(255,255,255,0.35); letter-spacing: 0.5px; text-transform: uppercase; font-weight: 500; }
        .wh-navlinks { display: flex; gap: 2px; }
        .wh-navitem {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 14px; border-radius: 8px;
          font-size: 13.5px; font-weight: 500;
          color: rgba(255,255,255,0.5);
          text-decoration: none; transition: all 0.15s ease;
          white-space: nowrap;
        }
        .wh-navitem:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); }
        .wh-navitem.active { background: rgba(37,99,235,0.25); color: #60a5fa; }
        .wh-navitem.active svg { color: #60a5fa; }
        @media (max-width: 640px) {
          .wh-navlinks { gap: 0; }
          .wh-navitem { padding: 7px 10px; font-size: 0; gap: 0; }
          .wh-navitem svg { font-size: 18px; width: 20px; height: 20px; }
          .wh-logo-sub { display: none; }
        }
      `}</style>
      <nav className="wh-nav">
        <div className="wh-nav-inner">
          <Link href="/" className="wh-logo">
            <div className="wh-logo-mark">
              <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
              <div className="wh-logo-text">WarehouseOS</div>
              <div className="wh-logo-sub">ระบบจัดการคลังสินค้า</div>
            </div>
          </Link>

          <div className="wh-navlinks">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`wh-navitem${pathname === item.href ? ' active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
}
