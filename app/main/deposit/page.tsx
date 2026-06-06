'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { CldUploadWidget } from 'next-cloudinary';

export default function DepositForm() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setItems([{ id: Date.now(), imageUrl: '' }]);
  }, []);

  const addItem = () => setItems([...items, { id: Date.now(), imageUrl: '' }]);
  const removeItem = (id: number) => setItems(items.filter(item => item.id !== id));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const trackingId = 'REC-' + Date.now().toString().slice(-8);

    const { data: deposit, error: depError } = await supabase
      .from('deposits')
      .insert([{
        tracking_id: trackingId,
        customer_name: formData.get('customer_name'),
        customer_phone: formData.get('customer_phone'),
      }])
      .select().single();

    if (depError) { alert('พลาด: ' + depError.message); setLoading(false); return; }

    const itemsToSave = items.map((item) => ({
      deposit_id: deposit.id,
      item_name: formData.get(`item_name_${item.id}`),
      quantity: parseInt(formData.get(`quantity_${item.id}`) as string),
      remaining_quantity: parseInt(formData.get(`quantity_${item.id}`) as string),
      unit: formData.get(`unit_${item.id}`),
      storage_location: formData.get(`storage_location_${item.id}`),
      detail: formData.get(`detail_${item.id}`),
      item_image_url: item.imageUrl,
    }));

    const { data: savedItems, error: itemError } = await supabase.from('deposit_items').insert(itemsToSave).select();

    if (itemError) {
      alert('บันทึกสินค้าพลาด: ' + itemError.message);
    } else {
      alert(`รับฝากสำเร็จ! Tracking ID: ${trackingId}`);
      if (savedItems && savedItems.length > 0) {
        const printId = savedItems[0].id;
        const width = 800, height = 900;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(`/print/${printId}`, 'PrintPopup', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no,toolbar=no,menubar=no`);
      }
      formRef.current?.reset();
      setItems([{ id: Date.now(), imageUrl: '' }]);
    }
    setLoading(false);
  };

  return (
    <div className="wh-page">
      <div className="wh-page-header">
        <h1 className="wh-page-title">รับฝากสินค้าใหม่</h1>
        <p className="wh-page-sub">กรอกข้อมูลผู้ฝากและรายละเอียดสินค้าที่ต้องการฝากในคลัง</p>
      </div>

      <form ref={formRef} onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem', alignItems: 'start' }}>

          {/* Left — customer info */}
          <div className="wh-card" style={{ position: 'sticky', top: '80px' }}>
            <div className="wh-card-title">ข้อมูลผู้ฝาก</div>

            <div className="wh-mb-3">
              <label className="wh-label">ชื่อ-นามสกุล ผู้ฝาก <span style={{ color: '#ef4444' }}>*</span></label>
              <input name="customer_name" className="wh-input" placeholder="ระบุชื่อผู้ฝาก..." required />
            </div>
            <div className="wh-mb-3">
              <label className="wh-label">เบอร์โทรศัพท์ติดต่อ</label>
              <input name="customer_phone" className="wh-input" placeholder="0xx-xxx-xxxx" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="wh-btn wh-btn-primary wh-btn-full wh-btn-lg"
              style={{ marginTop: '1rem' }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                  </svg>
                  บันทึก & พิมพ์ใบรับฝาก
                </>
              )}
            </button>
          </div>

          {/* Right — items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                รายการสินค้า ({items.length} รายการ)
              </h3>
            </div>

            {items.map((item, idx) => (
              <div key={item.id} className="wh-item-card">
                <div className="wh-item-card-header">
                  <span className="wh-item-number">รายการที่ {idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="wh-btn wh-btn-ghost"
                      style={{ padding: '4px 10px', fontSize: 12, color: '#dc2626', borderColor: '#fecaca' }}
                    >
                      ลบรายการนี้
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">ชื่อสิ่งของ <span style={{ color: '#ef4444' }}>*</span></label>
                    <input name={`item_name_${item.id}`} className="wh-input" placeholder="ระบุชื่อสิ่งของ..." required />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">ลักษณะเพิ่มเติม</label>
                    <textarea name={`detail_${item.id}`} className="wh-textarea" placeholder="รายละเอียด / ลักษณะของสิ่งของ..." />
                  </div>

                  <div>
                    <label className="wh-label">จำนวน <span style={{ color: '#ef4444' }}>*</span></label>
                    <input name={`quantity_${item.id}`} type="number" min="1" className="wh-input" placeholder="0" required />
                  </div>

                  <div>
                    <label className="wh-label">หน่วย <span style={{ color: '#ef4444' }}>*</span></label>
                    <input name={`unit_${item.id}`} className="wh-input" placeholder="เช่น ชิ้น, กล่อง, ถุง" required />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">พิกัดจัดเก็บในคลัง</label>
                    <input name={`storage_location_${item.id}`} className="wh-input" placeholder="เช่น โซน A / ชั้น 2 / ล็อก B3" />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">รูปภาพสิ่งของ</label>
                    <CldUploadWidget
                      uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET}
                      onSuccess={(r: any) => {
                        const newItems = [...items];
                        newItems[idx].imageUrl = r.info.secure_url;
                        setItems(newItems);
                      }}
                    >
                      {({ open }) => (
                        <button
                          type="button"
                          onClick={() => open()}
                          className={`wh-upload-btn${item.imageUrl ? ' uploaded' : ''}`}
                        >
                          {item.imageUrl ? (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                              อัปโหลดรูปภาพสำเร็จแล้ว — คลิกเพื่อเปลี่ยน
                            </span>
                          ) : (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              คลิกเพื่ออัปโหลดรูปภาพสิ่งของ
                            </span>
                          )}
                        </button>
                      )}
                    </CldUploadWidget>
                  </div>
                </div>
              </div>
            ))}

            <button type="button" onClick={addItem} className="wh-add-btn">
              + เพิ่มรายการสินค้า
            </button>
          </div>
        </div>
      </form>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          form > div { grid-template-columns: 1fr !important; }
          div[style*="sticky"] { position: static !important; }
          div[style*="320px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}