'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../../lib/supabase';

const UserGuide = dynamic(() => import('./UserGuide'), { ssr: false });

const navItems = [
  {
    href: '/main',
    label: 'ค้นหาสินค้า',
    description: 'ค้นหาสินค้าและดูตำแหน่งบนผัง',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="10.5" cy="10.5" r="6.5"/>
        <path d="m16 16 5 5"/>
      </svg>
    ),
  },
  {
    href: '/main/dashboard',
    label: 'ภาพรวม',
    description: 'ดูสรุปสถานะคลังสินค้า',
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
    description: 'เพิ่มสินค้าและกำหนดตำแหน่งเก็บ',
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
    description: 'ตรวจสอบและจัดการสินค้าทั้งหมด',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: '/main/warehouse-map',
    label: 'จัดผัง',
    description: 'จัดโซน Rack และชั้นวาง',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path d="M3 6.5 8 4l8 3 5-2.5v13L16 20l-8-3-5 2.5z"/>
        <path d="M8 4v13M16 7v13"/>
      </svg>
    ),
  },
  {
    href: '/main/withdraw',
    label: 'คืนสินค้า',
    description: 'บันทึกสินค้าออกจากคลัง',
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
    description: 'ตรวจสอบรายการคืนย้อนหลัง',
    icon: (
      <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
];

const primaryNavItems = navItems.slice(0, 2);
const warehouseNavItems = [navItems[2], navItems[3], navItems[5], navItems[6]];
const mapNavItem = navItems[4];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'warehouse' | 'manage' | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [account, setAccount] = useState<{ email: string; role: string } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      if (!user || !active) return;
      const { data: roleRow } = await supabase
        .from('warehouse_user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (active) setAccount({ email: user.email ?? 'พนักงาน', role: roleRow?.role ?? 'staff' });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setOpenDropdown(null);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const closeDropdown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenDropdown(null);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('pointerdown', closeDropdown);
    window.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeDropdown);
      window.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  const warehouseMenuActive = warehouseNavItems.some((item) => item.href === pathname);
  const manageMenuActive = pathname === mapNavItem.href || showGuide;

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <>
      <style>{`
        .sp-nav {
          position: sticky; top: 0; z-index: 100;
          background: #fffdf8;
          border-top: 4px solid var(--sp-navy);
          border-bottom: 1px solid var(--sp-border);
          font-family: 'Sarabun', 'Noto Sans Thai', sans-serif;
          box-shadow: 0 4px 18px rgba(23,63,122,0.09);
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
        .sp-logo-emblem svg { color: var(--sp-navy); }
        .sp-logo-text { font-size: 17px; font-weight: 800; color: var(--sp-navy); letter-spacing: -0.3px; line-height: 1.1; }
        .sp-logo-sub { font-size: 10.5px; color: var(--sp-text3); letter-spacing: 0.8px; font-weight: 500; margin-top: 1px; }

        .sp-navlinks { display: flex; gap: 2px; align-items: center; }
        .sp-navitem {
          display: flex; align-items: center; gap: 7px;
          padding: 7px 13px; border-radius: 8px;
          font-size: 13.5px; font-weight: 600;
          color: var(--sp-text3);
          text-decoration: none; transition: all 0.15s ease;
          white-space: nowrap; position: relative;
        }
        .sp-navitem:hover {
          background: var(--sp-bg2);
          color: var(--sp-navy);
        }
        .sp-navitem.active {
          background: #eaf3fd;
          color: var(--sp-navy);
          border: 1px solid #c9dcef;
        }
        .sp-navitem.active::after {
          content: '';
          position: absolute; bottom: -9px; left: 50%; transform: translateX(-50%);
          width: 4px; height: 4px; border-radius: 50%;
          background: var(--sp-orange);
        }
        button.sp-navitem {
          border: 1px solid transparent;
          background: transparent;
          font-family: inherit;
          cursor: pointer;
        }
        .sp-nav-group { position: relative; }
        .sp-nav-chevron { transition: transform .16s ease; }
        .sp-nav-chevron.open { transform: rotate(180deg); }
        .sp-dropdown {
          position: absolute; top: calc(100% + 13px); left: 0;
          width: 286px; padding: 8px;
          border: 1px solid #d6e1ee; border-radius: 13px;
          background: rgba(255,253,248,.98);
          box-shadow: 0 18px 45px rgba(23,63,122,.18);
          opacity: 0; visibility: hidden; transform: translateY(-5px);
          transition: opacity .15s ease, transform .15s ease, visibility .15s;
        }
        .sp-dropdown.open { opacity: 1; visibility: visible; transform: translateY(0); }
        .sp-dropdown::before {
          content: ''; position: absolute; top: -6px; left: 25px;
          width: 10px; height: 10px; transform: rotate(45deg);
          background: #fffdf8; border-left: 1px solid #d6e1ee; border-top: 1px solid #d6e1ee;
        }
        .sp-dropdown.manage { width: 258px; }
        .sp-dropdown-link {
          width: 100%; display: grid; grid-template-columns: 36px minmax(0,1fr); gap: 10px;
          align-items: center; padding: 9px 10px; border: 0; border-radius: 9px;
          background: transparent; color: var(--sp-text2); text-align: left;
          text-decoration: none; font-family: inherit; cursor: pointer;
          transition: background .14s ease, color .14s ease;
        }
        .sp-dropdown-link:hover { background: #eef5fd; color: var(--sp-navy); }
        .sp-dropdown-link.active { background: #e8f2fc; color: var(--sp-navy); }
        .sp-dropdown-icon {
          width: 36px; height: 36px; display: grid; place-items: center;
          border-radius: 9px; color: var(--sp-blue); background: #edf4fb;
        }
        .sp-dropdown-link.active .sp-dropdown-icon { color: #fff; background: linear-gradient(135deg,var(--sp-blue),var(--sp-blue-md)); }
        .sp-dropdown-copy { min-width: 0; }
        .sp-dropdown-copy strong { display: block; font-size: 13px; line-height: 1.25; }
        .sp-dropdown-copy small { display: block; margin-top: 2px; color: var(--sp-text3); font-size: 10.5px; line-height: 1.35; }
        .sp-dropdown-separator { height: 1px; margin: 6px 7px; background: var(--sp-border); }
        .sp-nav-divider {
          width: 1px; height: 24px;
          background: var(--sp-border);
          margin: 0 4px;
        }

        .sp-guide-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 13px; border-radius: 8px;
          font-size: 13px; font-weight: 700; font-family: inherit;
          background: var(--sp-orange-bg);
          color: var(--sp-orange-dark);
          border: 1px solid #efcdbf;
          cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .sp-guide-btn:hover {
          background: #ffe4d8;
          border-color: #e5a58c;
          color: #87351f;
        }
        .sp-ready {
          display:flex; align-items:center; gap:6px;
          padding:6px 9px; border:1px solid #c8e8d8; border-radius:99px;
          background:#eaf8f1; color:#116c49;
          font-size:10.5px; font-weight:700; white-space:nowrap;
        }
        .sp-ready-dot { width:7px; height:7px; border-radius:50%; background:#22a06b; box-shadow:0 0 0 3px rgba(34,160,107,.12); }
        .sp-account { display:flex; align-items:center; gap:7px; margin-left:5px; }
        .sp-account-text { max-width:105px; overflow:hidden; text-overflow:ellipsis; color:var(--sp-text3); font-size:10.5px; line-height:1.2; }
        .sp-signout { border:1px solid var(--sp-border); background:#fff; color:var(--sp-orange-dark); border-radius:7px; padding:6px 8px; cursor:pointer; font:700 11px inherit; }
        .sp-signout:hover { background:var(--sp-orange-bg); border-color:#efcdbf; }

        .sp-hamburger {
          display: none; background: none; border: none;
          color: var(--sp-navy); cursor: pointer; padding: 6px;
          border-radius: 6px; transition: all 0.15s;
        }
        .sp-hamburger:hover { background: var(--sp-bg2); color: var(--sp-blue); }

        .sp-mobile-menu {
          display: none;
          background: #fffdf8;
          border-top: 1px solid var(--sp-border);
          padding: 10px 1rem 16px;
          flex-direction: column; gap: 4px;
        }
        .sp-mobile-menu.open { display: flex; }
        .sp-mobile-navitem {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 14px; border-radius: 8px;
          font-size: 14.5px; font-weight: 600;
          color: var(--sp-text2);
          text-decoration: none; transition: all 0.15s;
        }
        .sp-mobile-navitem:hover { background: var(--sp-bg2); color: var(--sp-navy); }
        .sp-mobile-navitem.active { background: #eaf3fd; color: var(--sp-navy); }
        .sp-mobile-guide-btn {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 14px; border-radius: 8px;
          font-size: 14px; font-weight: 700; font-family: inherit;
          background: var(--sp-orange-bg);
          color: var(--sp-orange-dark); border: 1px solid #efcdbf;
          cursor: pointer; margin-top: 4px; transition: all 0.15s;
        }
        .sp-mobile-guide-btn:hover { background: #ffe4d8; }
        .sp-mobile-group {
          border: 1px solid var(--sp-border); border-radius: 10px;
          background: #fff; overflow: hidden;
        }
        .sp-mobile-group summary {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 14px; color: var(--sp-navy);
          font-size: 14px; font-weight: 800; cursor: pointer; list-style: none;
        }
        .sp-mobile-group summary::-webkit-details-marker { display: none; }
        .sp-mobile-group summary::after { content: '⌄'; margin-left: auto; color: var(--sp-text3); transition: transform .15s; }
        .sp-mobile-group[open] summary::after { transform: rotate(180deg); }
        .sp-mobile-group-body { padding: 0 6px 6px; }
        .sp-mobile-group .sp-mobile-navitem { padding-left: 12px; }
        .sp-mobile-group .sp-mobile-guide-btn { width: 100%; margin-top: 2px; border: 0; }

        @media (max-width: 1180px) {
          .sp-ready { display:none; }
        }
        @media (max-width: 900px) {
          .sp-navlinks { display: none; }
          .sp-guide-btn { display: none; }
          .sp-hamburger { display: flex; }
        }
      `}</style>

      {showGuide && <UserGuide onClose={() => setShowGuide(false)} />}

      <nav ref={navRef} className="sp-nav">
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
            {primaryNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`sp-navitem${pathname === item.href ? ' active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}

            <div className="sp-nav-divider" />
            <div className="sp-nav-group">
              <button
                type="button"
                className={`sp-navitem${warehouseMenuActive ? ' active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={openDropdown === 'warehouse'}
                aria-controls="warehouse-nav-menu"
                onClick={() => setOpenDropdown((current) => current === 'warehouse' ? null : 'warehouse')}
              >
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>
                </svg>
                <span>งานคลัง</span>
                <svg className={`sp-nav-chevron${openDropdown === 'warehouse' ? ' open' : ''}`} width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              <div id="warehouse-nav-menu" className={`sp-dropdown${openDropdown === 'warehouse' ? ' open' : ''}`} role="menu">
                {warehouseNavItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={`sp-dropdown-link${pathname === item.href ? ' active' : ''}`}
                    onClick={() => setOpenDropdown(null)}
                  >
                    <span className="sp-dropdown-icon">{item.icon}</span>
                    <span className="sp-dropdown-copy">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="sp-nav-group">
              <button
                type="button"
                className={`sp-navitem${manageMenuActive ? ' active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={openDropdown === 'manage'}
                aria-controls="manage-nav-menu"
                onClick={() => setOpenDropdown((current) => current === 'manage' ? null : 'manage')}
              >
                <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 6.5 8 4l8 3 5-2.5v13L16 20l-8-3-5 2.5z"/><path d="M8 4v13M16 7v13"/>
                </svg>
                <span>จัดการ</span>
                <svg className={`sp-nav-chevron${openDropdown === 'manage' ? ' open' : ''}`} width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              <div id="manage-nav-menu" className={`sp-dropdown manage${openDropdown === 'manage' ? ' open' : ''}`} role="menu">
                <Link
                  href={mapNavItem.href}
                  role="menuitem"
                  className={`sp-dropdown-link${pathname === mapNavItem.href ? ' active' : ''}`}
                  onClick={() => setOpenDropdown(null)}
                >
                  <span className="sp-dropdown-icon">{mapNavItem.icon}</span>
                  <span className="sp-dropdown-copy">
                    <strong>{mapNavItem.label}</strong>
                    <small>{mapNavItem.description}</small>
                  </span>
                </Link>
                <div className="sp-dropdown-separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="sp-dropdown-link"
                  onClick={() => { setShowGuide(true); setOpenDropdown(null); }}
                >
                  <span className="sp-dropdown-icon">
                    <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.1" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.7 2.7 0 1 1 4.1 2.3c-.9.5-1.6 1.1-1.6 2.2"/><path d="M12 17h.01"/>
                    </svg>
                  </span>
                  <span className="sp-dropdown-copy">
                    <strong>คู่มือการใช้งาน</strong>
                    <small>ดูขั้นตอนใช้งานแต่ละหน้า</small>
                  </span>
                </button>
              </div>
            </div>

            <div className="sp-nav-divider" />
            <span className="sp-ready"><i className="sp-ready-dot" />ระบบพร้อมใช้งาน</span>
            {account && (
              <div className="sp-account" title={`${account.email} · ${account.role}`}>
                <span className="sp-account-text">{account.email}<br />{account.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}</span>
                <button type="button" className="sp-signout" onClick={signOut}>ออก</button>
              </div>
            )}
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
          {primaryNavItems.map((item) => (
            <Link key={item.href} href={item.href}
              className={`sp-mobile-navitem${pathname === item.href ? ' active' : ''}`}
              onClick={() => setMenuOpen(false)}>
              {item.icon}
              {item.label}
            </Link>
          ))}
          <details className="sp-mobile-group" open={warehouseMenuActive}>
            <summary>
              <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>
              </svg>
              งานคลัง
            </summary>
            <div className="sp-mobile-group-body">
              {warehouseNavItems.map((item) => (
                <Link key={item.href} href={item.href}
                  className={`sp-mobile-navitem${pathname === item.href ? ' active' : ''}`}
                  onClick={() => setMenuOpen(false)}>
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
          <details className="sp-mobile-group" open={manageMenuActive}>
            <summary>
              <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 6.5 8 4l8 3 5-2.5v13L16 20l-8-3-5 2.5z"/><path d="M8 4v13M16 7v13"/>
              </svg>
              จัดการ
            </summary>
            <div className="sp-mobile-group-body">
              <Link href={mapNavItem.href}
                className={`sp-mobile-navitem${pathname === mapNavItem.href ? ' active' : ''}`}
                onClick={() => setMenuOpen(false)}>
                {mapNavItem.icon}
                {mapNavItem.label}
              </Link>
              <button className="sp-mobile-guide-btn" onClick={() => { setShowGuide(true); setMenuOpen(false); }}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                คู่มือการใช้งาน
              </button>
            </div>
          </details>
          {account && (
            <button className="sp-mobile-guide-btn" type="button" onClick={signOut}>
              ออกจากระบบ · {account.email}
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
