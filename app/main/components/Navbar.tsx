'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useState } from 'react';
import dynamic from 'next/dynamic';

const UserGuide = dynamic(() => import('./UserGuide'), { ssr: false });

const navItems = [
  {
    href: '/main',
    label: 'ภาพรวม',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    href: '/main/deposit',
    label: 'รับฝากสินค้า',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="12 22.08 12 12"/>
        <line x1="3.27" y1="6.96" x2="12" y2="12.04"/>
        <line x1="20.73" y1="6.96" x2="12" y2="12.04"/>
      </svg>
    ),
  },
  {
    href: '/main/inventory',
    label: 'รายการคลัง',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: '/main/withdraw',
    label: 'คืนสินค้า',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
      </svg>
    ),
  },
  {
    href: '/main/history',
    label: 'ประวัติการคืน',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <>
      <style>{`
        .sp-nav {
          position: sticky; top: 0; z-index: 100;
          background: linear-gradient(135deg, #0e3060 0%, #1a4f8a 60%, #1e6bbf 100%);
          border-bottom: 2.5px solid #c8972a;
          font-family: 'Sarabun', 'Noto Sans Thai', sans-serif;
          box-shadow: 0 4px 20px rgba(14,48,96,0.35);
        }
        .sp-nav-inner {
          max-width: 1320px; margin: 0 auto;
          padding: 0 1.5rem; height: 60px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .sp-logo {
          display: flex; align-items: center; gap: 12px;
          text-decoration: none; user-select: none;
        }
        .sp-logo-emblem {
          width: 38px; height: 38px; border-radius: 50%;
          background: linear-gradient(135deg,#c8972a,#e2b84a);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 10px rgba(200,151,42,0.45);
          flex-shrink: 0;
        }
        .sp-logo-emblem svg { color: #0e3060; }
        .sp-logo-text { font-size: 17px; font-weight: 800; color: #fff; letter-spacing: -0.3px; line-height: 1.1; }
        .sp-logo-sub { font-size: 10.5px; color: rgba(255,255,255,0.55); letter-spacing: 0.8px; font-weight: 500; margin-top: 1px; }

        .sp-navlinks { display: flex; gap: 2px; align-items: center; }
        .sp-navitem {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 13px; border-radius: 8px;
          font-size: 13.5px; font-weight: 600;
          color: rgba(255,255,255,0.65);
          text-decoration: none; transition: all 0.15s ease;
          white-space: nowrap; position: relative;
        }
        .sp-navitem:hover {
          background: rgba(255,255,255,0.10);
          color: #fff;
        }
        .sp-navitem.active {
          background: rgba(200,151,42,0.20);
          color: #e2b84a;
          border: 1px solid rgba(200,151,42,0.35);
        }
        .sp-navitem.active::after {
          content: '';
          position: absolute; bottom: -9px; left: 50%; transform: translateX(-50%);
          width: 4px; height: 4px; border-radius: 50%;
          background: #c8972a;
        }
        .sp-nav-divider {
          width: 1px; height: 24px;
          background: rgba(255,255,255,0.12);
          margin: 0 4px;
        }

        .sp-guide-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 13px; border-radius: 8px;
          font-size: 13px; font-weight: 700; font-family: inherit;
          background: rgba(200,151,42,0.15);
          color: #e2b84a;
          border: 1px solid rgba(200,151,42,0.30);
          cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .sp-guide-btn:hover {
          background: rgba(200,151,42,0.28);
          border-color: rgba(200,151,42,0.55);
          color: #f0cc6a;
        }

        .sp-hamburger {
          display: none; background: none; border: none;
          color: rgba(255,255,255,0.8); cursor: pointer; padding: 6px;
          border-radius: 6px; transition: all 0.15s;
        }
        .sp-hamburger:hover { background: rgba(255,255,255,0.1); color: #fff; }

        .sp-mobile-menu {
          display: none;
          background: #0e3060;
          border-top: 1px solid rgba(200,151,42,0.3);
          padding: 10px 1rem 16px;
          flex-direction: column; gap: 4px;
        }
        .sp-mobile-menu.open { display: flex; }
        .sp-mobile-navitem {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 14px; border-radius: 8px;
          font-size: 14.5px; font-weight: 600;
          color: rgba(255,255,255,0.7);
          text-decoration: none; transition: all 0.15s;
        }
        .sp-mobile-navitem:hover { background: rgba(255,255,255,0.08); color: #fff; }
        .sp-mobile-navitem.active { background: rgba(200,151,42,0.2); color: #e2b84a; }
        .sp-mobile-guide-btn {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 14px; border-radius: 8px;
          font-size: 14px; font-weight: 700; font-family: inherit;
          background: rgba(200,151,42,0.15);
          color: #e2b84a; border: 1px solid rgba(200,151,42,0.25);
          cursor: pointer; margin-top: 4px; transition: all 0.15s;
        }
        .sp-mobile-guide-btn:hover { background: rgba(200,151,42,0.25); }

        @media (max-width: 900px) {
          .sp-navlinks { display: none; }
          .sp-guide-btn { display: none; }
          .sp-hamburger { display: flex; }
        }
      `}</style>

      {showGuide && <UserGuide onClose={() => setShowGuide(false)} />}

      <nav className="sp-nav">
        <div className="sp-nav-inner">
          <Link href="/" className="sp-logo">
            <div className="sp-logo-emblem">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div>
              <div className="sp-logo-text">WarehouseOS</div>
              <div className="sp-logo-sub">สำเพ็งบุรีรัมย์</div>
            </div>
          </Link>

          <div className="sp-navlinks">
            {navItems.map((item, i) => (
              <Fragment key={item.href}>
                {i === 2 && <div className="sp-nav-divider" />}
                {i === 4 && <div className="sp-nav-divider" />}
                <Link
                  href={item.href}
                  className={`sp-navitem${pathname === item.href ? ' active' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </Fragment>
            ))}
            <div className="sp-nav-divider" />
            <button className="sp-guide-btn" onClick={() => setShowGuide(true)}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              คู่มือการใช้งาน
            </button>
          </div>

          <button className="sp-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="เมนู">
            {menuOpen ? (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>
        </div>

        <div className={`sp-mobile-menu${menuOpen ? ' open' : ''}`}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}
              className={`sp-mobile-navitem${pathname === item.href ? ' active' : ''}`}
              onClick={() => setMenuOpen(false)}>
              {item.icon}
              {item.label}
            </Link>
          ))}
          <button className="sp-mobile-guide-btn" onClick={() => { setShowGuide(true); setMenuOpen(false); }}>
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            คู่มือการใช้งาน
          </button>
        </div>
      </nav>
    </>
  );
}
