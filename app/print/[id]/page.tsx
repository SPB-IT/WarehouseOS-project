'use client';
import { useEffect, useState, use } from 'react';
import { supabase } from '../../../lib/supabase';

export default function PrintForm({ params }: { params: Promise<{ id: string }> }) {
  const [data, setData] = useState<any>(null);
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const { data } = await supabase
        .from('deposit_items')
        .select('*, deposits(*)')
        .eq('id', id)
        .single();
      setData(data);
    };
    fetchData();
  }, [id]);

  if (!data) return (
    <div style={{ padding: '40px', fontFamily: 'TH Sarabun New, Arial, sans-serif', textAlign: 'center', color: '#666' }}>
      กำลังเตรียมเอกสาร...
    </div>
  );

  const depositDate = data.deposits?.deposit_date
    ? new Date(data.deposits.deposit_date).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    : '-';

  const printedDate = new Date().toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric'
  });

  return (
    <div style={{
      maxWidth: '210mm',
      margin: '0 auto',
      padding: '20mm 24mm',
      backgroundColor: '#fff',
      color: '#000',
      fontFamily: 'TH Sarabun New, Arial, sans-serif',
      fontSize: '16px',
      minHeight: '297mm',
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{ height: '1px', flex: 1, background: '#000' }} />
          <span style={{ fontSize: '20px' }}>🏭</span>
          <div style={{ height: '1px', flex: 1, background: '#000' }} />
        </div>
        <p style={{ fontSize: '12px', letterSpacing: '0.15em', color: '#666', margin: '0 0 6px', textTransform: 'uppercase' }}>
          Warehouse Management System
        </p>
        <h1 style={{ fontSize: '26px', fontWeight: 'bold', margin: '0 0 4px' }}>ใบรับฝากพัสดุ</h1>
        <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Parcel Deposit Receipt</p>
        <div style={{ height: '1px', background: '#000', marginTop: '20px' }} />
      </div>

      {/* Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: '24px' }}>
        <div style={{ padding: '12px 0', borderBottom: '0.5px solid #ccc' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>เลขที่เอกสาร</p>
          <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{data.deposits?.tracking_id ?? '-'}</p>
        </div>
        <div style={{ padding: '12px 0', borderBottom: '0.5px solid #ccc', textAlign: 'right' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>วันที่รับฝาก</p>
          <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{depositDate}</p>
        </div>
        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>ชื่อผู้ฝาก</p>
          <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{data.deposits?.customer_name ?? '-'}</p>
        </div>
        <div style={{ padding: '12px 0', textAlign: 'right' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>เบอร์โทรศัพท์</p>
          <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{data.deposits?.customer_phone ?? '-'}</p>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '0.5px solid #ccc', borderRadius: '6px', overflow: 'hidden', marginBottom: '32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#555', width: '48px', borderBottom: '0.5px solid #ccc' }}>ลำดับ</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 'bold', color: '#555', borderBottom: '0.5px solid #ccc' }}>รายการพัสดุ</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#555', width: '80px', borderBottom: '0.5px solid #ccc' }}>จำนวน</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 'bold', color: '#555', width: '80px', borderBottom: '0.5px solid #ccc' }}>หน่วย</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '12px 14px', textAlign: 'center', color: '#666' }}>1</td>
              <td style={{ padding: '12px 14px' }}>{data.item_name}</td>
              <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 'bold' }}>{data.remaining_quantity}</td>
              <td style={{ padding: '12px 14px', textAlign: 'center', color: '#666' }}>{data.unit}</td>
            </tr>
            <tr style={{ background: '#f5f5f5' }}>
              <td colSpan={4} style={{ padding: '10px 14px', textAlign: 'right', fontSize: '14px', color: '#666' }}>
                รวมทั้งสิ้น: <strong>{data.remaining_quantity} {data.unit}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Note */}
      <div style={{ background: '#f9f9f9', borderRadius: '6px', padding: '14px 16px', marginBottom: '40px', fontSize: '14px' }}>
        <p style={{ margin: 0, color: '#666' }}>
          <strong style={{ color: '#000' }}>หมายเหตุ:</strong> กรุณาเก็บเอกสารนี้ไว้เป็นหลักฐาน บริษัทฯ จะไม่รับผิดชอบหากเอกสารสูญหาย
        </p>
      </div>

      {/* Signatures */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
        {['ลงชื่อเจ้าหน้าที่รับฝาก', 'ลงชื่อผู้ฝาก'].map((label) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <div style={{ height: '56px', borderBottom: '0.5px solid #000', marginBottom: '10px' }} />
            <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 3px' }}>{label}</p>
            <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>( ................................................ )</p>
            <p style={{ fontSize: '13px', color: '#666', margin: '4px 0 0' }}>วันที่ ........../........../..........​</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ height: '1px', background: '#ddd', margin: '32px 0 16px' }} />
      <p style={{ fontSize: '12px', color: '#999', textAlign: 'center', margin: 0, letterSpacing: '0.03em' }}>
        เอกสารนี้ออกโดยระบบ Warehouse Management System · พิมพ์เมื่อ {printedDate}
      </p>

      {/* Print Button */}
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print" style={{ marginTop: '40px', textAlign: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '10px 32px', backgroundColor: '#000', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '15px', borderRadius: '6px' }}
        >
          สั่งพิมพ์เอกสาร
        </button>
      </div>
    </div>
  );
}