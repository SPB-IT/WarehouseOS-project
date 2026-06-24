'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import type { DashboardStats, Withdrawal } from '../../types/warehouse';

export default function MainPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalDeposits: 0, totalItems: 0, totalRemaining: 0,
    activeItems: 0, returnedItems: 0, totalWithdrawals: 0,
  });
  const [recentWithdrawals, setRecentWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        { data: items },
        { data: deposits },
        { count: withdrawalCount },
        { data: recentW },
      ] = await Promise.all([
        supabase.from('deposit_items').select('quantity, remaining_quantity, status'),
        supabase.from('deposits').select('id'),
        // Bug #2 fix: แยก count query ออกจาก display query
        supabase.from('withdrawals').select('*', { count: 'exact', head: true }),
        supabase.from('withdrawals')
          .select('*, deposit_items(item_name, deposits(customer_name, tracking_id))')
          .order('withdraw_date', { ascending: false })
          .limit(8),
      ]);

      if (items) {
        setStats({
          totalDeposits: deposits?.length ?? 0,
          totalItems: items.reduce((a, i) => a + (i.quantity ?? 0), 0),
          totalRemaining: items.reduce((a, i) => a + (i.remaining_quantity ?? 0), 0),
          activeItems: items.filter(i => i.status !== 'คืนแล้ว' && i.remaining_quantity > 0).length,
          returnedItems: items.filter(i => i.status === 'คืนแล้ว' || i.remaining_quantity <= 0).length,
          totalWithdrawals: withdrawalCount ?? 0,
        });
      }
      if (recentW) setRecentWithdrawals(recentW as Withdrawal[]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const quickLinks = [
    {
      href: '/main/deposit', label: 'รับฝากสินค้าใหม่', desc: 'บันทึกสินค้าเข้าคลัง',
      color: 'var(--sp-blue)', bg: '#deeafa', border: '#b3d0f0',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      ),
    },
    {
      href: '/main/inventory', label: 'ดูรายการคลังทั้งหมด', desc: 'ค้นหาและจัดการสินค้า',
      color: '#0e7c3a', bg: '#dcfce7', border: '#a7f3d0',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      href: '/main/withdraw', label: 'บันทึกส่งคืนสินค้า', desc: 'คืนสินค้าให้ลูกค้า',
      color: 'var(--sp-gold)', bg: 'var(--sp-gold-bg)', border: '#f0d99a',
      icon: (
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="wh-page">
      {/* Header */}
      <div className="wh-page-header">
        <h1 className="wh-page-title">ภาพรวมคลังสินค้า</h1>
        <p className="wh-page-sub">สรุปสถานะและกิจกรรมล่าสุดของระบบ สำเพ็งบุรีรัมย์</p>
      </div>

      {/* Stat cards */}
      <div className="wh-stat-grid wh-mb-4">
        {[
          { label: 'ใบรับฝากทั้งหมด', value: stats.totalDeposits, unit: 'บิล', cls: 'wh-stat-blue',
            icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
          { label: 'คงเหลือในคลัง', value: stats.totalRemaining, unit: 'หน่วย', cls: 'wh-stat-green',
            icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> },
          { label: 'รายการกำลังฝาก', value: stats.activeItems, unit: 'รายการ', cls: 'wh-stat-gold',
            icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
          { label: 'คืนครบแล้ว', value: stats.returnedItems, unit: 'รายการ', cls: 'wh-stat-indigo',
            icon: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> },
        ].map((s) => (
          <div key={s.label} className={`wh-stat ${s.cls}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="wh-stat-label">{s.label}</div>
              <div style={{ opacity: 0.4 }}>{s.icon}</div>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="wh-stat-value">{loading ? '—' : s.value}</span>
              <span className="wh-stat-unit">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main content grid */}
      <div className="wh-dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.25rem', alignItems: 'start' }}>

        {/* Recent withdrawals */}
        <div className="wh-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1.5px solid var(--sp-bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--sp-navy)', letterSpacing: 0.2 }}>
              รายการส่งคืนล่าสุด
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!loading && (
                <span style={{ fontSize: 12, color: 'var(--sp-text3)', fontWeight: 600 }}>
                  รวม {stats.totalWithdrawals} ครั้ง
                </span>
              )}
              <Link href="/main/inventory" style={{ fontSize: 12, color: 'var(--sp-blue-md)', fontWeight: 700, textDecoration: 'none' }}>ดูทั้งหมด →</Link>
            </div>
          </div>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--sp-text3)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              กำลังโหลดข้อมูล...
            </div>
          ) : recentWithdrawals.length === 0 ? (
            <p className="wh-empty-row">ยังไม่มีรายการส่งคืน</p>
          ) : (
            <div className="wh-table-wrap">
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>ชื่อสินค้า</th>
                    <th>ผู้ฝาก / Tracking</th>
                    <th style={{ textAlign: 'center' }}>จำนวนคืน</th>
                    <th style={{ textAlign: 'right' }}>วันที่</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWithdrawals.map((w) => (
                    <tr key={w.id}>
                      <td style={{ fontWeight: 700, color: 'var(--sp-text)' }}>{w.deposit_items?.item_name || '-'}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--sp-text)' }}>{w.deposit_items?.deposits?.customer_name || '-'}</div>
                        <div className="wh-mono" style={{ color: 'var(--sp-blue-md)', marginTop: 2, fontSize: 11.5 }}>{w.deposit_items?.deposits?.tracking_id}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 800, color: 'var(--sp-blue)', background: '#deeafa', padding: '3px 10px', borderRadius: 99, fontSize: 13 }}>{w.withdraw_quantity}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--sp-text3)', whiteSpace: 'nowrap' }}>
                        {new Date(w.withdraw_date!).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="wh-card" style={{ padding: '1rem 1.25rem' }}>
            <div className="wh-card-title" style={{ marginBottom: '1rem' }}>เมนูด่วน</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quickLinks.map((q) => (
                <Link key={q.href} href={q.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 13,
                    padding: '12px 14px', borderRadius: 10,
                    border: `1.5px solid ${q.border}`, background: q.bg,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateX(0)'; }}
                  >
                    <div style={{ color: q.color, flexShrink: 0 }}>{q.icon}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--sp-navy)' }}>{q.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--sp-text3)', marginTop: 2 }}>{q.desc}</div>
                    </div>
                    <div style={{ marginLeft: 'auto', color: q.color, opacity: 0.5 }}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Summary mini card */}
          <div className="wh-card" style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg,var(--sp-navy),var(--sp-blue-md))', border: 'none' }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>อัตราคืนสินค้า</div>
            {!loading && stats.totalItems > 0 && (
              <>
                <div style={{ fontSize: 2.2 + 'rem', fontWeight: 900, color: '#fff', letterSpacing: -1.5, lineHeight: 1 }}>
                  {Math.round(((stats.totalItems - stats.totalRemaining) / stats.totalItems) * 100)}%
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
                  คืนแล้ว {stats.totalItems - stats.totalRemaining} / {stats.totalItems} หน่วย
                </div>
                <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round(((stats.totalItems - stats.totalRemaining) / stats.totalItems) * 100)}%`,
                    background: 'linear-gradient(90deg,#c8972a,#e2b84a)',
                    borderRadius: 99, transition: 'width 0.8s ease',
                  }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
