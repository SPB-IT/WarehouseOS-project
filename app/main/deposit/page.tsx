'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { CldUploadWidget } from 'next-cloudinary';
import { Toast, useToast } from '../components/Toast';
import type { Deposit, DepositItem } from '../../../types/warehouse';

function generateTrackingId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `REC-${ts}-${rand}`;
}

type DepositWithItems = Deposit & { deposit_items: DepositItem[] };
type SortKey = 'date_desc' | 'date_asc' | 'name_asc' | 'items_desc';
type FilterStatus = 'all' | 'active' | 'returned';

export default function DepositPage() {
  const [loading, setLoading] = useState(false);
  const [deposits, setDeposits] = useState<DepositWithItems[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const [showForm, setShowForm] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<DepositWithItems | null>(null);
  const [formItems, setFormItems] = useState<{ id: number; imageUrl: string }[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const [editingItem, setEditingItem] = useState<DepositItem | null>(null);
  const [editItemForm, setEditItemForm] = useState({ item_name: '', item_code: '', detail: '', quantity: 0, unit: '', storage_location: '' });
  const [editItemLoading, setEditItemLoading] = useState(false);

  const [successModal, setSuccessModal] = useState<{ trackingId: string; depositId: number } | null>(null);

  const { toasts, removeToast, toast } = useToast();
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => { fetchDeposits(); }, []);
  useEffect(() => { setPage(0); }, [searchTerm, filterStatus, sortKey]);

  const fetchDeposits = async () => {
    setListLoading(true);
    const { data } = await supabase
      .from('deposits')
      .select('*, deposit_items(*)')
      .order('id', { ascending: false });
    setDeposits((data as DepositWithItems[]) || []);
    setListLoading(false);
  };

  const toggleGroup = (id: number) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openAddForm = () => {
    setEditingDeposit(null);
    setFormItems([{ id: Date.now(), imageUrl: '' }]);
    setShowForm(true);
  };

  const openEditDeposit = (dep: DepositWithItems) => {
    setEditingDeposit(dep);
    setFormItems([{ id: Date.now(), imageUrl: '' }]);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    if (editingDeposit) {
      const { error: depErr } = await supabase.from('deposits').update({
        customer_name: formData.get('customer_name'),
        customer_phone: formData.get('customer_phone'),
        deposit_date: formData.get('deposit_date') as string,
        staff_received_name: formData.get('staff_received_name'),
      }).eq('id', editingDeposit.id);

      if (depErr) { toast('แก้ไขข้อมูลไม่สำเร็จ: ' + depErr.message, 'error'); setLoading(false); return; }

      const newItems = formItems.map(item => ({
        deposit_id: editingDeposit.id,
        item_name: formData.get(`item_name_${item.id}`),
        item_code: formData.get(`item_code_${item.id}`) || null,
        quantity: parseInt(formData.get(`quantity_${item.id}`) as string) || 0,
        remaining_quantity: parseInt(formData.get(`quantity_${item.id}`) as string) || 0,
        unit: formData.get(`unit_${item.id}`),
        storage_location: formData.get(`storage_location_${item.id}`),
        detail: formData.get(`detail_${item.id}`),
        item_image_url: item.imageUrl,
      })).filter(i => i.item_name);

      if (newItems.length > 0) {
        const { error: itemErr } = await supabase.from('deposit_items').insert(newItems);
        if (itemErr) { toast('เพิ่มสินค้าพลาด: ' + itemErr.message, 'error'); setLoading(false); return; }
      }

      toast('แก้ไขข้อมูลสำเร็จ!', 'success');
      setShowForm(false);
      await fetchDeposits();
    } else {
      const trackingId = generateTrackingId();
      const depositDateInput = formData.get('deposit_date') as string;

      const { data: deposit, error: depError } = await supabase
        .from('deposits')
        .insert([{
          tracking_id: trackingId,
          customer_name: formData.get('customer_name'),
          customer_phone: formData.get('customer_phone'),
          deposit_date: depositDateInput || new Date().toISOString(),
          staff_received_name: formData.get('staff_received_name'),
        }]).select().single();

      if (depError) { toast('บันทึกไม่สำเร็จ: ' + depError.message, 'error'); setLoading(false); return; }

      const itemsToSave = formItems.map(item => ({
        deposit_id: deposit.id,
        item_name: formData.get(`item_name_${item.id}`),
        item_code: formData.get(`item_code_${item.id}`) || null,
        quantity: parseInt(formData.get(`quantity_${item.id}`) as string),
        remaining_quantity: parseInt(formData.get(`quantity_${item.id}`) as string),
        unit: formData.get(`unit_${item.id}`),
        storage_location: formData.get(`storage_location_${item.id}`),
        detail: formData.get(`detail_${item.id}`),
        item_image_url: item.imageUrl,
      }));

      const { error: itemError } = await supabase.from('deposit_items').insert(itemsToSave).select();
      if (itemError) {
        toast('บันทึกสินค้าพลาด: ' + itemError.message, 'error');
      } else {
        setSuccessModal({ trackingId, depositId: deposit.id });
        setShowForm(false);
        formRef.current?.reset();
        setFormItems([{ id: Date.now(), imageUrl: '' }]);
        await fetchDeposits();
      }
    }
    setLoading(false);
  };

  const handlePrint = (depositId: number) => {
    const fetchFirstItemAndPrint = async () => {
      const { data } = await supabase.from('deposit_items').select('id').eq('deposit_id', depositId).order('id', { ascending: true }).limit(1).single();
      if (data) {
        const w = 800, h = 900;
        window.open(`/print/${data.id}`, 'PrintPopup', `width=${w},height=${h},top=${window.screen.height/2-h/2},left=${window.screen.width/2-w/2},scrollbars=yes,status=no,toolbar=no,menubar=no`);
      }
    };
    fetchFirstItemAndPrint();
  };

  const handleDeleteDeposit = async (dep: DepositWithItems) => {
    if (!confirm(`ลบ ${dep.tracking_id} และสินค้าทั้งหมด ${dep.deposit_items?.length || 0} รายการ?`)) return;
    const { error } = await supabase.from('deposits').delete().eq('id', dep.id);
    if (error) toast('ลบไม่สำเร็จ: ' + error.message, 'error');
    else { toast('ลบเรียบร้อยแล้ว', 'success'); await fetchDeposits(); }
  };

  const openEditItem = (item: DepositItem) => {
    setEditingItem(item);
    setEditItemForm({
      item_name: item.item_name || '',
      item_code: item.item_code || '',
      detail: item.detail || '',
      quantity: item.quantity,
      unit: item.unit || '',
      storage_location: item.storage_location || '',
    });
  };

  const handleEditItemSave = async () => {
    if (!editingItem) return;
    setEditItemLoading(true);
    const { error } = await supabase.from('deposit_items').update({
      item_name: editItemForm.item_name,
      item_code: editItemForm.item_code || null,
      detail: editItemForm.detail,
      quantity: editItemForm.quantity,
      unit: editItemForm.unit,
      storage_location: editItemForm.storage_location,
    }).eq('id', editingItem.id);
    if (error) toast('แก้ไขไม่สำเร็จ: ' + error.message, 'error');
    else { toast('แก้ไขสินค้าสำเร็จ!', 'success'); setEditingItem(null); await fetchDeposits(); }
    setEditItemLoading(false);
  };

  const handleDeleteItem = async (item: DepositItem) => {
    if (!confirm(`ลบสินค้า "${item.item_name}" ?`)) return;
    const { error } = await supabase.from('deposit_items').delete().eq('id', item.id);
    if (error) toast('ลบไม่สำเร็จ: ' + error.message, 'error');
    else { toast('ลบสินค้าเรียบร้อย', 'success'); await fetchDeposits(); }
  };

  const filtered = deposits.filter(dep => {
    const s = searchTerm.toLowerCase();
    const matchSearch = !s ||
      dep.tracking_id?.toLowerCase().includes(s) ||
      dep.customer_name?.toLowerCase().includes(s) ||
      dep.customer_phone?.toLowerCase().includes(s);
    if (!matchSearch) return false;
    if (filterStatus === 'active') return dep.deposit_items?.some(i => i.remaining_quantity > 0);
    if (filterStatus === 'returned') return dep.deposit_items?.length > 0 && dep.deposit_items.every(i => i.remaining_quantity <= 0);
    return true;
  }).sort((a, b) => {
    if (sortKey === 'date_desc') return new Date(b.deposit_date || b.created_at || 0).getTime() - new Date(a.deposit_date || a.created_at || 0).getTime();
    if (sortKey === 'date_asc') return new Date(a.deposit_date || a.created_at || 0).getTime() - new Date(b.deposit_date || b.created_at || 0).getTime();
    if (sortKey === 'name_asc') return (a.customer_name || '').localeCompare(b.customer_name || '', 'th');
    if (sortKey === 'items_desc') return (b.deposit_items?.length || 0) - (a.deposit_items?.length || 0);
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="wh-page">
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* ── Success Modal ── */}
      {successModal && (
        <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSuccessModal(null); }}>
          <div className="wh-modal" style={{ maxWidth: 420, textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg,#dcfce7,#bbf7d0)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="32" height="32" fill="none" stroke="var(--sp-success)" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 900, color: 'var(--sp-navy)' }}>รับฝากสำเร็จ!</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--sp-text3)' }}>บันทึกสินค้าเข้าคลังเรียบร้อยแล้ว</p>
            <div style={{ background: 'linear-gradient(90deg,var(--sp-navy),var(--sp-blue-md))', color: '#fff', padding: '10px 20px', borderRadius: 10, marginBottom: 20, display: 'inline-block' }}>
              <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1, marginBottom: 3 }}>TRACKING ID</div>
              <div className="wh-mono" style={{ fontSize: 18, fontWeight: 900, letterSpacing: 2 }}>{successModal.trackingId}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handlePrint(successModal.depositId)} className="wh-btn wh-btn-primary" style={{ flex: 1 }}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                พิมพ์ใบรับฝาก
              </button>
              <button onClick={() => setSuccessModal(null)} className="wh-btn wh-btn-ghost" style={{ flex: 1 }}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Deposit Modal — 2-column layout ── */}
      {showForm && (
        <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="wh-modal" style={{ maxWidth: 900, width: '95vw', maxHeight: '92vh', overflowY: 'auto', padding: '1.5rem' }}>
            <div className="wh-modal-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="var(--sp-gold)" strokeWidth="2.5" viewBox="0 0 24 24">
                  {editingDeposit
                    ? <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>
                    : <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="12 22.08 12 12"/></>
                  }
                </svg>
                {editingDeposit ? `แก้ไข — ${editingDeposit.tracking_id}` : 'รับฝากสินค้าใหม่'}
              </span>
              <button className="wh-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit}>
              {/* 2-column layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
                {/* LEFT — ข้อมูลผู้ฝาก */}
                <div style={{ background: 'var(--sp-bg)', borderRadius: 12, padding: '16px', border: '1px solid var(--sp-border)', position: 'sticky', top: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                    <div style={{ width: 3, height: 16, background: 'var(--sp-gold)', borderRadius: 2 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--sp-text2)', letterSpacing: 0.5, textTransform: 'uppercase' }}>ข้อมูลผู้ฝาก</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label className="wh-label">ชื่อ-นามสกุล ผู้ฝาก <span style={{ color: '#ef4444' }}>*</span></label>
                      <input name="customer_name" className="wh-input" placeholder="ระบุชื่อผู้ฝาก..." required defaultValue={editingDeposit?.customer_name || ''} />
                    </div>
                    <div>
                      <label className="wh-label">เบอร์โทรศัพท์</label>
                      <input name="customer_phone" className="wh-input" placeholder="0xx-xxx-xxxx" defaultValue={editingDeposit?.customer_phone || ''} />
                    </div>
                    <div>
                      <label className="wh-label">วันที่รับฝาก <span style={{ color: '#ef4444' }}>*</span></label>
                      <input name="deposit_date" type="date" className="wh-input" required
                        defaultValue={editingDeposit?.deposit_date ? editingDeposit.deposit_date.split('T')[0] : todayStr} />
                    </div>
                    <div>
                      <label className="wh-label">ชื่อพนักงานผู้รับฝาก <span style={{ color: '#ef4444' }}>*</span></label>
                      <input name="staff_received_name" className="wh-input" placeholder="กรอกชื่อพนักงานที่รับฝาก..." required
                        defaultValue={editingDeposit?.staff_received_name || ''} />
                    </div>
                  </div>

                  {/* Actions pinned in left column */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    <button type="submit" disabled={loading} className="wh-btn wh-btn-primary" style={{ flex: 2, padding: '10px 0', fontSize: 14 }}>
                      {loading ? 'กำลังบันทึก...' : editingDeposit ? 'บันทึกการแก้ไข' : 'บันทึก & รับใบรับฝาก'}
                    </button>
                    <button type="button" onClick={() => setShowForm(false)} className="wh-btn wh-btn-ghost" style={{ flex: 1 }}>ยกเลิก</button>
                  </div>
                </div>

                {/* RIGHT — รายการสินค้า */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                    <div style={{ width: 3, height: 16, background: 'var(--sp-blue-md)', borderRadius: 2 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--sp-text2)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      {editingDeposit ? 'เพิ่มสินค้าใหม่เข้า Deposit นี้' : 'รายการสินค้า'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {formItems.map((item, idx) => (
                      <div key={item.id} className="wh-item-card">
                        <div className="wh-item-card-header">
                          <span className="wh-item-number">สินค้ารายการที่ {idx + 1}</span>
                          {(formItems.length > 1 || editingDeposit) && (
                            <button type="button" onClick={() => setFormItems(f => f.filter(i => i.id !== item.id))} className="wh-btn"
                              style={{ padding: '3px 10px', fontSize: 12, color: 'var(--sp-danger)', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 7 }}>
                              ✕ ลบ
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div>
                            <label className="wh-label">ชื่อสิ่งของ {!editingDeposit && <span style={{ color: '#ef4444' }}>*</span>}</label>
                            <input name={`item_name_${item.id}`} className="wh-input" placeholder="ระบุชื่อสิ่งของ..." required={!editingDeposit} />
                          </div>
                          <div>
                            <label className="wh-label">รหัสสินค้า</label>
                            <input name={`item_code_${item.id}`} className="wh-input" placeholder="เช่น SKU-001 (ถ้ามี)" />
                          </div>
                          <div>
                            <label className="wh-label">ลักษณะเพิ่มเติม</label>
                            <textarea name={`detail_${item.id}`} className="wh-textarea" placeholder="รายละเอียด / ลักษณะของสิ่งของ..." style={{ minHeight: 52 }} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <label className="wh-label">จำนวน {!editingDeposit && <span style={{ color: '#ef4444' }}>*</span>}</label>
                              <input name={`quantity_${item.id}`} type="number" min="1" className="wh-input" placeholder="0" required={!editingDeposit} />
                            </div>
                            <div>
                              <label className="wh-label">หน่วย {!editingDeposit && <span style={{ color: '#ef4444' }}>*</span>}</label>
                              <input name={`unit_${item.id}`} className="wh-input" placeholder="เช่น ชิ้น, กล่อง" required={!editingDeposit} />
                            </div>
                          </div>
                          <div>
                            <label className="wh-label">พิกัดจัดเก็บในคลัง</label>
                            <input name={`storage_location_${item.id}`} className="wh-input" placeholder="เช่น โซน A / ชั้น 2 / ล็อก B3" />
                          </div>
                          <div>
                            <label className="wh-label">รูปภาพสิ่งของ</label>
                            {item.imageUrl && (
                              <div style={{ marginBottom: 8, borderRadius: 8, overflow: 'hidden', border: '2px solid #bbf7d0', display: 'inline-block' }}>
                                <img src={item.imageUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', display: 'block' }} />
                              </div>
                            )}
                            <CldUploadWidget uploadPreset={process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET}
                              onSuccess={(r: any) => {
                                const next = [...formItems];
                                next[idx].imageUrl = r.info.secure_url;
                                setFormItems(next);
                              }}>
                              {({ open }) => (
                                <button type="button" onClick={() => open()} className={`wh-upload-btn${item.imageUrl ? ' uploaded' : ''}`}>
                                  {item.imageUrl
                                    ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>อัปโหลดสำเร็จ — คลิกเพื่อเปลี่ยน</span>
                                    : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>คลิกเพื่ออัปโหลดรูปภาพ</span>
                                  }
                                </button>
                              )}
                            </CldUploadWidget>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={() => setFormItems(f => [...f, { id: Date.now(), imageUrl: '' }])} className="wh-add-btn" style={{ marginTop: 10 }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }}>
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    เพิ่มรายการสินค้า
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Item Modal ── */}
      {editingItem && (
        <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingItem(null); }}>
          <div className="wh-modal" style={{ maxWidth: 460 }}>
            <div className="wh-modal-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="var(--sp-gold)" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                แก้ไขสินค้า
              </span>
              <button className="wh-modal-close" onClick={() => setEditingItem(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label className="wh-label">ชื่อสิ่งของ</label>
                <input className="wh-input" value={editItemForm.item_name} onChange={e => setEditItemForm(f => ({ ...f, item_name: e.target.value }))} />
              </div>
              <div>
                <label className="wh-label">รหัสสินค้า</label>
                <input className="wh-input" value={editItemForm.item_code} onChange={e => setEditItemForm(f => ({ ...f, item_code: e.target.value }))} placeholder="เช่น SKU-001 (ถ้ามี)" />
              </div>
              <div>
                <label className="wh-label">ลักษณะเพิ่มเติม</label>
                <input className="wh-input" value={editItemForm.detail} onChange={e => setEditItemForm(f => ({ ...f, detail: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="wh-label">จำนวน (ทั้งหมด)</label>
                  <input className="wh-input" type="number" value={editItemForm.quantity} onChange={e => setEditItemForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="wh-label">หน่วย</label>
                  <input className="wh-input" value={editItemForm.unit} onChange={e => setEditItemForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="wh-label">พิกัดจัดเก็บ</label>
                <input className="wh-input" value={editItemForm.storage_location} onChange={e => setEditItemForm(f => ({ ...f, storage_location: e.target.value }))} placeholder="เช่น โซน A / ชั้น 2" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
              <button onClick={handleEditItemSave} disabled={editItemLoading} className="wh-btn wh-btn-gold wh-btn-full" style={{ flex: 2 }}>
                {editItemLoading ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
              <button onClick={() => setEditingItem(null)} className="wh-btn wh-btn-ghost" style={{ flex: 1 }}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="wh-page-header-row">
        <div className="wh-page-header-left">
          <h1 className="wh-page-title">รับฝากสินค้า</h1>
          <p className="wh-page-sub">ทั้งหมด {deposits.length} รายการ</p>
        </div>
        <button onClick={openAddForm} className="wh-btn wh-btn-primary" style={{ gap: 6, padding: '8px 16px', fontSize: 13.5 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          รับฝากใหม่
        </button>
      </div>

      {/* ── Toolbar: Search + Filter + Sort + PageSize ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        {/* Search */}
        <div className="wh-search-wrap" style={{ flex: '1 1 220px', minWidth: 200, position: 'relative' }}>
          <svg className="wh-search-icon" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" className="wh-search-input" placeholder="ค้นหาชื่อผู้ฝาก, เบอร์, Tracking ID..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingRight: searchTerm ? 34 : 12 }} />
          {searchTerm && (
            <button type="button" className="wh-search-clear" onClick={() => setSearchTerm('')}>✕</button>
          )}
        </div>

        {/* Status filter pills */}
        <div style={{ display: 'flex', gap: 5 }}>
          {([['all','ทั้งหมด'],['active','กำลังฝาก'],['returned','คืนครบแล้ว']] as [FilterStatus,string][]).map(([v, label]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              className={`wh-filter-pill${filterStatus === v ? ` active-${v}` : ''}`}
              style={{ padding: '5px 12px', fontSize: 12.5 }}>
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
          className="wh-select" style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}>
          <option value="date_desc">เรียงตาม: วันใหม่สุด</option>
          <option value="date_asc">เรียงตาม: วันเก่าสุด</option>
          <option value="name_asc">เรียงตาม: ชื่อ ก-ฮ</option>
          <option value="items_desc">เรียงตาม: จำนวนสินค้ามากสุด</option>
        </select>

        {/* Page size */}
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
          className="wh-select" style={{ width: 'auto', fontSize: 13, padding: '6px 10px' }}>
          <option value={5}>แสดง 5 รายการ</option>
          <option value={10}>แสดง 10 รายการ</option>
          <option value={20}>แสดง 20 รายการ</option>
          <option value={50}>แสดง 50 รายการ</option>
        </select>

        <button onClick={fetchDeposits} className="wh-btn wh-btn-ghost" style={{ padding: '6px 12px', fontSize: 13, gap: 5 }} title="รีเฟรช">
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          รีเฟรช
        </button>
      </div>

      {/* ── Deposit List with collapsible groups ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {listLoading ? (
          <div className="wh-card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--sp-text3)', fontSize: 13 }}>กำลังโหลดข้อมูล...</div>
        ) : filtered.length === 0 ? (
          <div className="wh-card" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--sp-text3)', fontSize: 13 }}>ไม่พบข้อมูล</div>
        ) : paginated.map(dep => {
          const activeItems = dep.deposit_items?.filter(i => i.remaining_quantity > 0) || [];
          const allReturned = dep.deposit_items?.length > 0 && activeItems.length === 0;
          const dateStr = dep.deposit_date ? new Date(dep.deposit_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
          const isCollapsed = collapsedGroups.has(dep.id);

          return (
            <div key={dep.id} className="wh-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Deposit header — click to collapse */}
              <div
                onClick={() => toggleGroup(dep.id)}
                style={{
                  padding: '11px 16px',
                  background: allReturned ? 'var(--sp-bg)' : 'linear-gradient(135deg,#f0f7ff,#e8f0fb)',
                  borderBottom: isCollapsed ? 'none' : '1.5px solid var(--sp-bg2)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                  cursor: 'pointer', userSelect: 'none',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Collapse chevron */}
                  <svg width="14" height="14" fill="none" stroke="var(--sp-text3)" strokeWidth="2.5" viewBox="0 0 24 24"
                    style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease', flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  <span className="wh-mono" style={{ background: allReturned ? 'var(--sp-bg2)' : 'linear-gradient(90deg,var(--sp-navy),var(--sp-blue-md))', color: allReturned ? 'var(--sp-text3)' : '#fff', padding: '3px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 800, letterSpacing: 0.5 }}>
                    {dep.tracking_id}
                  </span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--sp-navy)' }}>{dep.customer_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--sp-text3)' }}>
                      {dep.customer_phone || '—'} · {dateStr}
                      {dep.staff_received_name && <> · รับฝากโดย {dep.staff_received_name}</>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={e => e.stopPropagation()}>
                  {allReturned
                    ? <span className="wh-badge wh-badge-returned" style={{ fontSize: 11.5, padding: '3px 10px' }}>คืนครบแล้ว</span>
                    : <span className="wh-badge wh-badge-active" style={{ fontSize: 11.5, padding: '3px 10px' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sp-success)', display: 'inline-block', animation: 'pulse 2s ease infinite' }} />ฝากอยู่ {activeItems.length} รายการ</span>
                  }
                  <button onClick={() => handlePrint(dep.id)} className="wh-btn" style={{ padding: '4px 9px', fontSize: 11.5, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 6 }}>
                    🖨 พิมพ์
                  </button>
                  <button onClick={() => openEditDeposit(dep)} className="wh-btn" style={{ padding: '4px 9px', fontSize: 11.5, background: 'var(--sp-gold-bg)', color: '#92400e', border: '1px solid #f0d99a', borderRadius: 6 }}>
                    ✏️
                  </button>
                  <button onClick={() => handleDeleteDeposit(dep)} className="wh-btn" style={{ padding: '4px 9px', fontSize: 11.5, background: '#fef2f2', color: 'var(--sp-danger)', border: '1px solid #fecaca', borderRadius: 6 }}>
                    🗑
                  </button>
                </div>
              </div>

              {/* Items list — collapsible */}
              {!isCollapsed && (
                <div style={{ padding: '10px 16px 14px' }}>
                  {(!dep.deposit_items || dep.deposit_items.length === 0) ? (
                    <div style={{ fontSize: 12.5, color: 'var(--sp-text3)', textAlign: 'center', padding: '10px 0' }}>ไม่มีรายการสินค้า</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {dep.deposit_items.map(item => {
                        const isRet = item.remaining_quantity <= 0 || item.status === 'คืนแล้ว';
                        const pct = Math.round((item.remaining_quantity / item.quantity) * 100);
                        return (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: isRet ? 'var(--sp-bg)' : '#f8fbff', border: `1px solid ${isRet ? 'var(--sp-border)' : '#d0e4f7'}`, borderRadius: 9 }}>
                            {item.item_image_url
                              ? <img src={item.item_image_url} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1.5px solid var(--sp-border)', flexShrink: 0 }} />
                              : <div style={{ width: 34, height: 34, background: 'var(--sp-bg2)', borderRadius: 6, border: '1.5px dashed var(--sp-border)', flexShrink: 0 }} />
                            }
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: isRet ? 'var(--sp-text3)' : 'var(--sp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {item.item_name}
                                {item.item_code && <span className="wh-mono" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--sp-text3)', background: 'var(--sp-bg2)', padding: '1px 6px', borderRadius: 5 }}>{item.item_code}</span>}
                              </div>
                              {item.detail && <div style={{ fontSize: 11, color: 'var(--sp-text3)' }}>{item.detail}</div>}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                <div style={{ flex: 1, background: 'var(--sp-bg2)', borderRadius: 99, height: 4, overflow: 'hidden', maxWidth: 70 }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: isRet ? 'var(--sp-text3)' : 'linear-gradient(90deg,var(--sp-blue),var(--sp-blue-lt))', borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 11.5, fontWeight: 800, color: isRet ? 'var(--sp-text3)' : 'var(--sp-blue)', whiteSpace: 'nowrap' }}>{item.remaining_quantity}/{item.quantity} {item.unit}</span>
                                {item.storage_location && <span style={{ fontSize: 11, color: 'var(--sp-text3)', whiteSpace: 'nowrap' }}>📍 {item.storage_location}</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button onClick={() => openEditItem(item)} className="wh-btn" style={{ padding: '3px 9px', fontSize: 11.5, background: 'var(--sp-gold-bg)', color: '#92400e', border: '1px solid #f0d99a', borderRadius: 6 }}>แก้ไข</button>
                              <button onClick={() => handleDeleteItem(item)} className="wh-btn" style={{ padding: '3px 9px', fontSize: 11.5, background: '#fef2f2', color: 'var(--sp-danger)', border: '1px solid #fecaca', borderRadius: 6 }}>ลบ</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      {!listLoading && filtered.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: 'var(--sp-text3)' }}>
            หน้า {page + 1} / {totalPages} &nbsp;(แสดง {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} จาก {filtered.length} รายการ)
          </span>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <button onClick={() => setPage(0)} disabled={page === 0} className="wh-btn wh-btn-ghost" style={{ padding: '5px 10px', fontSize: 12.5, opacity: page === 0 ? 0.4 : 1 }}>«</button>
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="wh-btn wh-btn-ghost" style={{ padding: '5px 12px', fontSize: 12.5, opacity: page === 0 ? 0.4 : 1 }}>‹ ก่อนหน้า</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(0, Math.min(page - 2, totalPages - 5));
              const p = start + i;
              return (
                <button key={p} onClick={() => setPage(p)} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12.5, minWidth: 32, background: p === page ? 'var(--sp-blue)' : 'transparent', color: p === page ? '#fff' : 'var(--sp-text2)', border: `1.5px solid ${p === page ? 'var(--sp-blue)' : 'var(--sp-border)'}`, borderRadius: 7 }}>
                  {p + 1}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="wh-btn wh-btn-ghost" style={{ padding: '5px 12px', fontSize: 12.5, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>ถัดไป ›</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="wh-btn wh-btn-ghost" style={{ padding: '5px 10px', fontSize: 12.5, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}