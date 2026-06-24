'use client';
import { useState } from 'react';

type GuideStep = {
  icon: React.ReactNode;
  title: string;
  desc: string;
  tip?: string;
};

type GuideSection = {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  steps: GuideStep[];
};

const guides: GuideSection[] = [
  {
    id: 'dashboard',
    label: '📊 ภาพรวม',
    color: '#1a4f8a',
    bg: '#deeafa',
    border: '#b3d0f0',
    steps: [
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
        title: 'ดูสถิติภาพรวมระบบ',
        desc: 'หน้าแรกแสดงตัวเลขสรุป: จำนวนใบรับฝาก, สินค้าคงเหลือในคลัง, รายการกำลังฝาก และรายการที่คืนแล้ว — มองแวบเดียวรู้สถานะทั้งหมด',
        tip: 'ข้อมูลอัปเดตแบบ real-time ทุกครั้งที่โหลดหน้า',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>,
        title: 'รายการส่งคืนล่าสุด',
        desc: 'ดูประวัติการคืนสินค้า 8 รายการล่าสุด พร้อมชื่อสินค้า ชื่อผู้ฝาก และ Tracking ID ในหน้าเดียว',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
        title: 'เมนูด่วน',
        desc: 'ใช้การ์ด "เมนูด่วน" ทางขวาเพื่อไปยังหน้าที่ใช้บ่อย เช่น รับฝากสินค้าใหม่, ดูรายการคลัง หรือบันทึกส่งคืน',
      },
    ],
  },
  {
    id: 'deposit',
    label: '📦 รับฝากสินค้า',
    color: '#0e3060',
    bg: '#eef4fb',
    border: '#c3d9f5',
    steps: [
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
        title: 'กดปุ่ม "รับฝากสินค้าใหม่"',
        desc: 'กดปุ่มสีน้ำเงินด้านบนขวา เพื่อเปิดฟอร์มกรอกข้อมูลผู้ฝาก ระบบจะสร้าง Tracking ID อัตโนมัติให้ทันที',
        tip: 'Tracking ID รูปแบบ REC-XXXX-XXXX จะถูกสร้างให้อัตโนมัติ ไม่ต้องกรอกเอง',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
        title: 'กรอกข้อมูลผู้ฝาก',
        desc: 'กรอก ชื่อ-นามสกุลผู้ฝาก (บังคับ), เบอร์โทร, วันที่รับฝาก และชื่อพนักงานผู้รับ ให้ครบถ้วน',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
        title: 'เพิ่มรายการสินค้า',
        desc: 'กรอกชื่อสิ่งของ จำนวน หน่วย ที่จัดเก็บ และรายละเอียด กดปุ่ม "+ เพิ่มสินค้ารายการที่ 2" หากมีสินค้าหลายชนิดในใบรับฝากเดียวกัน',
        tip: 'สามารถอัปโหลดรูปภาพสินค้าได้ โดยกดปุ่ม "คลิกเพื่ออัปโหลดรูปภาพ"',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
        title: 'บันทึกและพิมพ์ใบรับฝาก',
        desc: 'กด "บันทึกรับฝาก" ระบบจะแสดง Tracking ID และเปิดหน้าต่างพิมพ์ใบรับฝากสำหรับมอบให้ลูกค้า',
        tip: 'ใบรับฝากแสดง QR Code และ Tracking ID — ลูกค้าใช้ยืนยันตัวตนตอนมารับของคืน',
      },
    ],
  },
  {
    id: 'inventory',
    label: '🏠 รายการคลัง',
    color: '#0e7c3a',
    bg: '#f0fdf4',
    border: '#a7f3d0',
    steps: [
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
        title: 'ค้นหาสินค้า',
        desc: 'พิมพ์ชื่อสินค้า, ชื่อผู้ฝาก, เบอร์โทร หรือ Tracking ID ในช่องค้นหา — ผลลัพธ์จะอัปเดตทันทีโดยไม่ต้องกด Enter',
        tip: 'กดปุ่ม "ล้างการค้นหา" (✕) เพื่อรีเซตตัวกรองทั้งหมด',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
        title: 'กรองตามสถานะ',
        desc: 'ใช้ปุ่มกรอง "ทั้งหมด / กำลังฝาก / คืนแล้ว" เพื่อดูเฉพาะสินค้าที่ต้องการ',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
        title: 'แก้ไขหรือลบรายการ',
        desc: 'กดปุ่ม ✏️ เพื่อแก้ไขข้อมูลสินค้า (ชื่อ, จำนวน, ที่จัดเก็บ) หรือกดปุ่ม 🗑 เพื่อลบรายการออกจากคลัง',
        tip: 'การแก้ไขจำนวนใน "รายการคลัง" จะปรับ quantity ต้นทาง ไม่ใช่ remaining_quantity',
      },
    ],
  },
  {
    id: 'withdraw',
    label: '↩️ คืนสินค้า',
    color: '#c8972a',
    bg: '#fdf6e3',
    border: '#f0d99a',
    steps: [
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
        title: 'ค้นหาด้วย Tracking ID หรือชื่อผู้ฝาก',
        desc: 'กรอก Tracking ID (REC-XXXX) หรือชื่อผู้ฝากในช่องค้นหา แล้วกด "ค้นหา" หรือ Enter เพื่อดึงรายการสินค้าที่ยังฝากอยู่',
        tip: 'สามารถสแกน QR Code จากใบรับฝากเพื่อกรอก Tracking ID อัตโนมัติ',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
        title: 'เลือกรายการสินค้าที่ต้องการคืน',
        desc: 'คลิกเพื่อ ✓ เลือกสินค้าแต่ละรายการ จากนั้นกำหนดจำนวนที่ต้องการคืนในช่องตัวเลข (ต้องไม่เกินจำนวนคงเหลือ)',
        tip: 'สามารถเลือกหลายรายการพร้อมกันได้ในคราวเดียว',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>,
        title: 'ยืนยันการคืนและพิมพ์ใบคืนสินค้า',
        desc: 'กดปุ่ม "คืนสินค้าที่เลือก" กรอกชื่อพนักงานผู้คืน และหมายเหตุ (ถ้ามี) แล้วกด "ยืนยันการคืน" ระบบจะเปิดใบคืนสินค้าให้พิมพ์ทันที',
        tip: 'ระบบจะอัปเดตจำนวนคงเหลือและสถานะสินค้าให้อัตโนมัติ',
      },
    ],
  },
  {
    id: 'history',
    label: '🕐 ประวัติการคืน',
    color: '#4f46e5',
    bg: '#f0f0ff',
    border: '#c7d2fe',
    steps: [
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
        title: 'ดูประวัติทั้งหมด',
        desc: 'หน้านี้แสดงประวัติการคืนสินค้าทุกรายการ เรียงจากล่าสุดไปเก่าสุด พร้อมชื่อสินค้า ผู้ฝาก และพนักงานผู้คืน',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
        title: 'ค้นหาประวัติ',
        desc: 'ค้นหาด้วยชื่อสินค้า ชื่อผู้ฝาก หรือ Tracking ID เพื่อกรองประวัติเฉพาะรายการที่ต้องการ',
      },
      {
        icon: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
        title: 'ส่งออกข้อมูล CSV',
        desc: 'กดปุ่ม "Export CSV" เพื่อดาวน์โหลดประวัติทั้งหมดเป็นไฟล์ Excel สำหรับทำรายงาน',
        tip: 'ไฟล์ CSV เปิดได้ใน Excel, Google Sheets หรือ Numbers',
      },
    ],
  },
];

export default function UserGuide({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState(guides[0].id);
  const section = guides.find(g => g.id === activeSection) || guides[0];

  return (
    <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 30px 60px rgba(8,20,48,0.28)',
        border: '1px solid #e8eef6',
        animation: 'modalPop 0.22s cubic-bezier(.34,1.56,.64,1)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0e3060 0%, #1a4f8a 60%, #1e6bbf 100%)',
          padding: '22px 24px 18px', flexShrink: 0,
          borderBottom: '3px solid #c8972a',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(200,151,42,0.25)', border: '1px solid rgba(200,151,42,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="18" height="18" fill="none" stroke="#e2b84a" strokeWidth="2.2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: -0.4 }}>
                  คู่มือการใช้งาน WarehouseOS
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginLeft: 44 }}>
                คลิกหัวข้อด้านล่างเพื่อดูวิธีใช้งานแต่ละส่วน
              </p>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.7)', cursor: 'pointer', borderRadius: 8,
              padding: '6px 11px', fontSize: 16, fontWeight: 700, transition: 'all 0.15s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; }}>
              ✕
            </button>
          </div>

          {/* Tab nav */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            {guides.map(g => (
              <button key={g.id} onClick={() => setActiveSection(g.id)} style={{
                padding: '6px 13px', borderRadius: 99, fontSize: 12.5, fontWeight: 700,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                background: activeSection === g.id ? '#c8972a' : 'rgba(255,255,255,0.12)',
                color: activeSection === g.id ? '#0e3060' : 'rgba(255,255,255,0.75)',
                boxShadow: activeSection === g.id ? '0 2px 8px rgba(200,151,42,0.4)' : 'none',
              }}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', padding: '20px 24px 24px', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {section.steps.map((step, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: 14, padding: '16px 18px',
                background: idx % 2 === 0 ? '#f8fafc' : '#fff',
                border: `1.5px solid ${section.border}`,
                borderLeft: `4px solid ${section.color}`,
                borderRadius: 12,
                transition: 'all 0.15s',
              }}>
                {/* Step number */}
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: section.bg, border: `1.5px solid ${section.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: section.color,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{idx + 1}</span>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ color: section.color }}>{step.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#0e1f3d' }}>{step.title}</span>
                  </div>
                  <p style={{ margin: '0 0 0', fontSize: 13, color: '#3b5280', lineHeight: 1.65 }}>
                    {step.desc}
                  </p>
                  {step.tip && (
                    <div style={{
                      marginTop: 8, padding: '7px 12px', borderRadius: 8,
                      background: '#fffbeb', border: '1px solid #fde68a',
                      fontSize: 12, color: '#92400e', display: 'flex', gap: 6, alignItems: 'flex-start',
                    }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}>💡</span>
                      <span>{step.tip}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 10,
            background: '#f0f4f9', border: '1px solid #d1dce8',
            fontSize: 12, color: '#7a93b8', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            หากต้องการความช่วยเหลือเพิ่มเติม กรุณาติดต่อผู้ดูแลระบบ WarehouseOS
          </div>
        </div>
      </div>
    </div>
  );
}
