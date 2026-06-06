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
    <div style={{ padding: '40px', fontFamily: 'TH Sarabun New, Arial, sans-serif', textAlign: 'center', color: '#666' }}>
      กำลังเตรียมเอกสาร...
    </div>
  );
  if (error) return (
    <div style={{ padding: '40px', fontFamily: 'TH Sarabun New, Arial, sans-serif', color: '#c00' }}>
      เกิดข้อผิดพลาด: {error}
    </div>
  );
  if (!data || data.length === 0) return (
    <div style={{ padding: '40px', fontFamily: 'TH Sarabun New, Arial, sans-serif', color: '#b45309' }}>
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
  const printedDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  const totalQty = data.reduce((sum: number, item: any) => sum + (Number(item.withdraw_quantity) || 0), 0);

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
          <span style={{ fontSize: '20px' }}>📦</span>
          <div style={{ height: '1px', flex: 1, background: '#000' }} />
        </div>
        <p style={{ fontSize: '12px', letterSpacing: '0.15em', color: '#666', margin: '0 0 6px', textTransform: 'uppercase' }}>
          Warehouse Management System
        </p>
        <h1 style={{ fontSize: '26px', fontWeight: 'bold', margin: '0 0 4px' }}>ใบส่งคืนสินค้าให้ลูกค้า</h1>
        <p style={{ fontSize: '14px', color: '#666', margin: 0 }}>Parcel Return Receipt</p>
        <div style={{ height: '1px', background: '#000', marginTop: '20px' }} />
      </div>

      {/* Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginBottom: '24px' }}>
        <div style={{ padding: '12px 0', borderBottom: '0.5px solid #ccc' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>เลขที่เอกสาร (Tracking)</p>
          <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{allTrackingIds || '-'}</p>
        </div>
        <div style={{ padding: '12px 0', borderBottom: '0.5px solid #ccc', textAlign: 'right' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>วันที่ส่งคืน</p>
          <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{withdrawDate}</p>
        </div>
        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>ชื่อผู้รับคืน (ลูกค้า)</p>
          <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{allCustomerNames || '-'}</p>
        </div>
        <div style={{ padding: '12px 0', textAlign: 'right' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 3px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>เบอร์โทรศัพท์</p>
          <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>{allCustomerPhones || '-'}</p>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '0.5px solid #ccc', borderRadius: '6px', overflow: 'hidden', marginBottom: '32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '44px' }} />
            <col style={{ width: '30%' }} />
            <col />
            <col style={{ width: '72px' }} />
            <col style={{ width: '72px' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              {['ลำดับ', 'รายการพัสดุ', 'หมายเหตุการส่งคืน', 'จำนวน', 'หน่วย'].map((h, i) => (
                <th key={h} style={{
                  padding: '10px 12px',
                  textAlign: i === 0 || i >= 3 ? 'center' : 'left',
                  fontWeight: 'bold',
                  color: '#555',
                  borderBottom: '0.5px solid #ccc',
                  fontSize: '14px',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item: any, index: number) => (
              <tr key={item.id} style={{ borderBottom: '0.5px solid #eee' }}>
                <td style={{ padding: '12px', textAlign: 'center', color: '#666' }}>{index + 1}</td>
                <td style={{ padding: '12px' }}>
                  <div>{item.deposit_items?.item_name}</div>
                  <span style={{ display: 'block', fontSize: '11px', color: '#999', fontFamily: 'monospace', marginTop: '2px' }}>
                    {item.deposit_items?.deposits?.tracking_id}
                  </span>
                </td>
                <td style={{ padding: '12px', color: '#444' }}>
                  {item.remark || 'คืนสินค้าพัสดุให้ลูกค้าเรียบร้อยแล้ว'}
                </td>
                <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{item.withdraw_quantity}</td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#666' }}>{item.deposit_items?.unit}</td>
              </tr>
            ))}
            <tr style={{ background: '#f5f5f5' }}>
              <td colSpan={5} style={{ padding: '10px 14px', textAlign: 'right', fontSize: '14px', color: '#666' }}>
                รวมทั้งสิ้น: <strong style={{ color: '#000' }}>{totalQty} รายการ</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Note */}
      <div style={{ background: '#f9f9f9', borderRadius: '6px', padding: '14px 16px', marginBottom: '40px', fontSize: '14px' }}>
        <p style={{ margin: 0, color: '#666' }}>
          <strong style={{ color: '#000' }}>หมายเหตุ:</strong> กรุณาตรวจสอบสินค้าก่อนลงนามรับ หากพบความเสียหายให้แจ้งเจ้าหน้าที่ทันที
        </p>
      </div>

      {/* Signatures */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: '56px', borderBottom: '0.5px solid #000', marginBottom: '10px' }} />
          <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 3px' }}>ลงชื่อผู้ส่งคืน / เจ้าหน้าที่พัสดุ</p>
          <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
            ( {firstRecord.staff_signature_name || '................................................'} )
          </p>
          <p style={{ fontSize: '13px', color: '#666', margin: '4px 0 0' }}>วันที่ ........../........../..........​</p>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ height: '56px', borderBottom: '0.5px solid #000', marginBottom: '10px' }} />
          <p style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 3px' }}>ลงชื่อผู้รับคืน / ลูกค้า</p>
          <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>( ................................................ )</p>
          <p style={{ fontSize: '13px', color: '#666', margin: '4px 0 0' }}>วันที่ ........../........../..........​</p>
        </div>
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