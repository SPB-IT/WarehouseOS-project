'use client';
import { useEffect, useState, use } from 'react';
import { supabase } from '../../../lib/supabase';

export default function PrintForm({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const unwrappedParams = use(params);
  const id = unwrappedParams.id;

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const decodedId = decodeURIComponent(id);
        const idArray = decodedId.split(',').map(item => item.trim()).filter(Boolean);
        const numericIds = idArray.map(Number).filter(n => !isNaN(n));
        const finalIds = numericIds.length === idArray.length ? numericIds : idArray;

        const { data: withdrawalsData, error: supabaseError } = await supabase
          .from('withdrawals')
          .select('*, deposit_items(*, deposits(*))')
          .in('id', finalIds);

        if (supabaseError) setError(supabaseError.message);
        else setData(withdrawalsData);
      } catch (err: any) {
        setError(err.message || 'เกิดข้อผิดพลาดในการดึงข้อมูล');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return (
    <div style={{ padding: '40px', fontFamily: 'TH Sarabun New, Sarabun, Arial, sans-serif', textAlign: 'center', color: '#666' }}>
      กำลังเตรียมเอกสาร...
    </div>
  );
  if (error) return (
    <div style={{ padding: '40px', fontFamily: 'TH Sarabun New, Sarabun, Arial, sans-serif', color: '#c00' }}>
      เกิดข้อผิดพลาด: {error}
    </div>
  );
  if (!data || data.length === 0) return (
    <div style={{ padding: '40px', fontFamily: 'TH Sarabun New, Sarabun, Arial, sans-serif', color: '#b45309' }}>
      ไม่พบข้อมูลใบส่งคืนสินค้าสำหรับ ID: {id}
    </div>
  );

  const firstRecord = data[0];
  const allTrackingIds = Array.from(new Set(data.map(item => item.deposit_items?.deposits?.tracking_id).filter(Boolean))).join(', ');
  const allCustomerNames = Array.from(new Set(data.map(item => item.deposit_items?.deposits?.customer_name).filter(Boolean))).join(', ');
  const allCustomerPhones = Array.from(new Set(data.map(item => item.deposit_items?.deposits?.customer_phone).filter(Boolean))).join(', ');
  const rawDate = firstRecord.withdraw_date || firstRecord.created_at;
  const withdrawDate = rawDate
    ? new Date(rawDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '-';
  const printedDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const printedTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  const totalQty = data.reduce((sum: number, item: any) => sum + (Number(item.withdraw_quantity) || 0), 0);
  const docNo = `RTN-${firstRecord.id || id}`;
  const LINE = '#000';

  return (
    <div style={{
      maxWidth: '210mm', margin: '0 auto', padding: '12mm 14mm',
      backgroundColor: '#fff', color: '#1a1a1a',
      fontFamily: 'TH Sarabun New, Sarabun, Arial, sans-serif',
      fontSize: '13px', minHeight: '297mm',
      lineHeight: 1.5,
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap');
        @media print {
          .no-print { display: none !important; }
          @page { margin: 0; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .doc-table { width: 100%; border-collapse: collapse; }
        .doc-table th, .doc-table td { border: 1px solid ${LINE}; padding: 5px 8px; font-size: 13px; vertical-align: top; }
        .doc-table th { font-weight: 700; color: #1a1a1a; text-align: left; background: #fff; }
      `}</style>

      {/* ══ PAGE NUMBER + DOC NO ══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ fontSize: '11px', color: '#888' }}>หน้า 1/1</div>
        <table style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ border: `1px solid ${LINE}`, padding: '3px 8px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>เลขที่เอกสาร</td>
              <td style={{ border: `1px solid ${LINE}`, padding: '3px 8px', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{docNo}</td>
            </tr>
            <tr>
              <td style={{ border: `1px solid ${LINE}`, padding: '3px 8px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>วันที่เอกสาร</td>
              <td style={{ border: `1px solid ${LINE}`, padding: '3px 8px', fontSize: '12px', whiteSpace: 'nowrap' }}>{withdrawDate}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ══ DOCUMENT TITLE ══ */}
      <div style={{ textAlign: 'center', fontSize: '19px', fontWeight: 800, color: '#1a1a1a', margin: '6px 0 12px' }}>ใบส่งคืนสินค้า</div>

      {/* ══ INFO SECTION ══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
        <tbody>
          <tr>
            <td style={{ border: `1px solid ${LINE}`, padding: '5px 8px', fontSize: '13px', width: '50%' }}>
              <span style={{ fontWeight: 700 }}>ผู้รับคืน</span>
              <span style={{ marginLeft: 10 }}>{allCustomerNames || '—'}</span>
            </td>
            <td style={{ border: `1px solid ${LINE}`, padding: '5px 8px', fontSize: '13px', width: '50%' }}>
              <span style={{ fontWeight: 700 }}>วันที่ส่งคืน</span>
              <span style={{ marginLeft: 10 }}>{withdrawDate}</span>
            </td>
          </tr>
          <tr>
            <td style={{ border: `1px solid ${LINE}`, padding: '5px 8px', fontSize: '13px' }}>
              <span style={{ fontWeight: 700 }}>เบอร์โทรศัพท์</span>
              <span style={{ marginLeft: 10 }}>{allCustomerPhones || '—'}</span>
            </td>
            <td style={{ border: `1px solid ${LINE}`, padding: '5px 8px', fontSize: '13px' }}>
              <span style={{ fontWeight: 700 }}>พนักงานผู้ดำเนินการ</span>
              <span style={{ marginLeft: 10 }}>{firstRecord.staff_signature_name || '—'}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ══ ITEMS TABLE ══ */}
      <table className="doc-table" style={{ marginBottom: '0' }}>
        <thead>
          <tr>
            <th style={{ width: '36px', textAlign: 'center' }}>ลำดับ</th>
            <th>รายการพัสดุ</th>
            <th style={{ width: '160px' }}>หมายเหตุการส่งคืน</th>
            <th style={{ width: '60px', textAlign: 'center' }}>จำนวน</th>
            <th style={{ width: '60px', textAlign: 'center' }}>หน่วยนับ</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item: any, index: number) => (
            <tr key={item.id}>
              <td style={{ textAlign: 'center', color: '#444' }}>{index + 1}</td>
              <td>
                <div style={{ fontWeight: 700 }}>{item.deposit_items?.item_name}</div>
                {item.deposit_items?.detail && (
                  <div style={{ fontSize: '12px', color: '#777' }}>
                    {item.deposit_items.detail}
                  </div>
                )}
              </td>
              <td style={{ color: '#555' }}>{item.remark || 'คืนสินค้าพัสดุเรียบร้อยแล้ว'}</td>
              <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.withdraw_quantity}</td>
              <td style={{ textAlign: 'center' }}>{item.deposit_items?.unit}</td>
            </tr>
          ))}
          {/* filler rows to keep the form looking like a printed slip */}
          {Array.from({ length: Math.max(0, 4 - data.length) }).map((_, i) => (
            <tr key={`filler-${i}`}>
              <td>&nbsp;</td><td></td><td></td><td></td><td></td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>รวม</td>
            <td colSpan={2} style={{ textAlign: 'center', fontWeight: 800 }}>{totalQty}</td>
          </tr>
        </tbody>
      </table>

      {/* ══ NOTES (เส้นเปล่าสำหรับเขียนหมายเหตุ) ══ */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '12px 0 30px', fontSize: '13px' }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>หมายเหตุ</span>
        <span style={{ flex: 1, borderBottom: '1px dotted #000', height: '1px' }}></span>
      </div>

      {/* ══ SIGNATURES (แบบไม่มีกรอบ ใช้เส้นประจุดเดียวสำหรับลงชื่อ) ══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontSize: '13px' }}>
        {[
          { label: 'เจ้าหน้าที่ผู้ส่งคืน', name: firstRecord.staff_signature_name },
          { label: 'ผู้รับคืน', name: '' },
        ].map((sig, i) => (
          <div key={i} style={{ textAlign: 'center', width: '46%' }}>
            <div style={{ borderBottom: '1px dotted #000', width: '70%', margin: '0 auto 14px', height: '24px' }}></div>
            <div style={{ marginBottom: '6px' }}>
              ( {sig.name || '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'} )
            </div>
            <div style={{ marginBottom: '8px' }}>ตำแหน่ง .........................................</div>
            <div style={{ fontWeight: 700 }}>{sig.label}</div>
          </div>
        ))}
      </div>

      {/* ══ FOOTER ══ */}
      <div style={{ borderTop: '1px solid #ddd', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '10px', color: '#aaa' }}>เอกสารอ้างอิง: {docNo}</div>
        <div style={{ fontSize: '10px', color: '#aaa', textAlign: 'right' }}>
          พิมพ์เมื่อ {printedDate} เวลา {printedTime} น.
        </div>
      </div>

      {/* Print Button */}
      <div className="no-print" style={{ marginTop: '28px', textAlign: 'center', display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '10px 32px', backgroundColor: '#0e3060', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '15px', borderRadius: '8px', fontWeight: 700, fontFamily: 'inherit' }}
        >
          🖨 สั่งพิมพ์เอกสาร
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: '10px 24px', backgroundColor: '#f0f4f9', color: '#0e3060', border: '1.5px solid #d1dce8', cursor: 'pointer', fontSize: '15px', borderRadius: '8px', fontWeight: 600, fontFamily: 'inherit' }}
        >
          ปิด
        </button>
      </div>
    </div>
  );
}