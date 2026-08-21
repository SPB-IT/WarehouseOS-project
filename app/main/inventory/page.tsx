'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { fetchAllSupabaseRows } from '../../../lib/supabasePagination';
import { displayItemDetail, displayStorageLocation } from '../../../lib/warehouseLocation';
import type { DepositItem, Withdrawal } from '../../../types/warehouse';
import { Toast, useToast } from '../components/Toast';
import type { WarehouseBin, WarehouseRack, WarehouseZone } from '../warehouse-map/types';
import {
  fetchWarehouseBins,
  fetchWarehouseRacks,
  fetchWarehouseZones,
} from '../warehouse-map/warehouseMapRepository';
import {
  formatWarehousePlacement,
  getRackBins,
  getZoneRacks,
} from '../warehouse-map/warehousePlacement';

interface WithdrawalHistory extends Withdrawal {
  deposit_items?: DepositItem & { deposits?: { tracking_id: string; customer_name: string } };
}

interface WarehouseLocationMovement {
  id: number;
  from_location: string | null;
  to_location: string | null;
  moved_by: string | null;
  moved_at: string;
}

function formatZoneLocation(zone: WarehouseZone) {
  return [zone.locationCode, zone.floor].filter(Boolean).join(' / ');
}

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<DepositItem[]>([]);
  const [viewingItem, setViewingItem] = useState<DepositItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ทั้งหมด');
  const [demoFilter, setDemoFilter] = useState<'all' | 'real' | 'demo'>('all');
  const [loading, setLoading] = useState(true);
  const [imgZoom, setImgZoom] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [returnedCount, setReturnedCount] = useState(0);
  const [warehouseZones, setWarehouseZones] = useState<WarehouseZone[]>([]);
  const [warehouseRacks, setWarehouseRacks] = useState<WarehouseRack[]>([]);
  const [warehouseBins, setWarehouseBins] = useState<WarehouseBin[]>([]);

  // ── มุมมอง: แยกตามแท็กกิ้ง (list) หรือ สรุปยอดรวมตามชื่อ/รหัสสินค้า (summary) ──
  const [viewMode, setViewMode] = useState<'list' | 'summary'>('list');
  const [summaryItems, setSummaryItems] = useState<any[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [breakdownGroup, setBreakdownGroup] = useState<any | null>(null);
  const [summaryPage, setSummaryPage] = useState(0);
  const [summaryPageSize, setSummaryPageSize] = useState<number>(10);

  // เพิ่ม State สำหรับระบบเรียงลำดับ และจำนวนแถวที่ต้องการแสดงต่อหน้า (PageSize)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [pageSize, setPageSize] = useState<number>(10); // ค่าเริ่มต้นเปลี่ยนมาปรับตาม Component ควบคุม

  // ── ประวัติการรับ-คืน ──
  const [historyItem, setHistoryItem] = useState<DepositItem | null>(null);
  const [historyData, setHistoryData] = useState<WithdrawalHistory[]>([]);
  const [locationHistory, setLocationHistory] = useState<WarehouseLocationMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Edit modal ──
  const [editItem, setEditItem] = useState<DepositItem | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    item_name: '', item_code: '', detail: '', quantity: 0, unit: '',
    storage_location: '', warehouse_zone_id: '', warehouse_rack_id: '', warehouse_bin_id: '',
    customer_name: '', customer_phone: '',
  });

  // ── Export ──
  const [exportLoading, setExportLoading] = useState(false);

  const { toasts, removeToast, toast } = useToast();

  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const quickSearch = new URLSearchParams(window.location.search).get('q');
      if (quickSearch) setSearchTerm(quickSearch);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => { setPage(0); }, [debouncedSearch, statusFilter, demoFilter, pageSize, sortBy]);
  useEffect(() => {
    void Promise.all([fetchWarehouseZones(), fetchWarehouseRacks(), fetchWarehouseBins()])
      .then(([zones, racks, bins]) => {
        setWarehouseZones(zones);
        setWarehouseRacks(racks);
        setWarehouseBins(bins);
      })
      .catch(() => {
        setWarehouseZones([]);
        setWarehouseRacks([]);
        setWarehouseBins([]);
      });
  }, []);
  useEffect(() => { setSummaryPage(0); }, [debouncedSearch, statusFilter, demoFilter, summaryPageSize, viewMode]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('deposit_items')
      .select('*, deposits(id, tracking_id, customer_name, customer_phone, deposit_date, staff_received_name)', { count: 'exact' });

    const quickParams = new URLSearchParams(window.location.search);
    const quickZoneId = quickParams.get('zoneId');
    const quickRackId = quickParams.get('rackId');
    const quickRackNumber = Number(quickParams.get('rack') ?? 0);
    if (quickRackId) {
      query = query.eq('warehouse_rack_id', quickRackId);
    } else if (quickZoneId && quickRackNumber > 0) {
      query = query
        .eq('warehouse_zone_id', quickZoneId)
        .ilike('storage_location', `%Rack ${quickRackNumber}%`);
    }

    if (statusFilter === 'กำลังฝาก') {
      query = query.neq('status', 'คืนแล้ว').gt('remaining_quantity', 0);
    } else if (statusFilter === 'คืนแล้ว') {
      query = query.or('status.eq.คืนแล้ว,remaining_quantity.lte.0');
    }
    if (demoFilter === 'demo') query = query.or('item_code.ilike.MOCK-%,item_code.ilike.DEMO-%');
    else if (demoFilter === 'real') query = query.or('and(item_code.not.ilike.MOCK-%,item_code.not.ilike.DEMO-%),item_code.is.null');

    const s = debouncedSearch.trim().replace(/[,()%]/g, '');
    if (s) {
      const { data: matchedDeposits } = await supabase
        .from('deposits')
        .select('id')
        .or(`tracking_id.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
      const depositIds = (matchedDeposits || []).map((d: any) => d.id);

      if (depositIds.length > 0) {
        query = query.or(`item_name.ilike.%${s}%,item_code.ilike.%${s}%,storage_location.ilike.%${s}%,deposit_id.in.(${depositIds.join(',')})`);
      } else {
        query = query.or(`item_name.ilike.%${s}%,item_code.ilike.%${s}%,storage_location.ilike.%${s}%`);
      }
    }

    // แก้ไขตรรกะ Order ให้อ้างอิงตาม State sortBy ที่ผู้ใช้เลือกจากหน้าเว็บ
    const { data, count } = await query
      .order('id', { ascending: sortBy === 'oldest' })
      .range(from, to);

    setItems((data as DepositItem[]) || []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }, [page, pageSize, statusFilter, demoFilter, debouncedSearch, sortBy]);

  // ── ดึงข้อมูลทั้งหมดที่ตรงตามฟิลเตอร์ แล้วจัดกลุ่มรวมยอดตามรหัสสินค้า (ถ้ามี) หรือชื่อสินค้า ──
  // สินค้าที่ "รหัสตรงกัน" จะถูกรวมเป็นกลุ่มเดียวกันก่อน ถ้าไม่มีรหัสจะรวมตาม "ชื่อตรงกัน" แทน
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    let query = supabase
      .from('deposit_items')
      .select('*, deposits(id, tracking_id, customer_name, customer_phone, deposit_date, staff_received_name)');

    const quickParams = new URLSearchParams(window.location.search);
    const quickZoneId = quickParams.get('zoneId');
    const quickRackId = quickParams.get('rackId');
    const quickRackNumber = Number(quickParams.get('rack') ?? 0);
    if (quickRackId) {
      query = query.eq('warehouse_rack_id', quickRackId);
    } else if (quickZoneId && quickRackNumber > 0) {
      query = query
        .eq('warehouse_zone_id', quickZoneId)
        .ilike('storage_location', `%Rack ${quickRackNumber}%`);
    }

    if (statusFilter === 'กำลังฝาก') {
      query = query.neq('status', 'คืนแล้ว').gt('remaining_quantity', 0);
    } else if (statusFilter === 'คืนแล้ว') {
      query = query.or('status.eq.คืนแล้ว,remaining_quantity.lte.0');
    }
    if (demoFilter === 'demo') query = query.or('item_code.ilike.MOCK-%,item_code.ilike.DEMO-%');
    else if (demoFilter === 'real') query = query.or('and(item_code.not.ilike.MOCK-%,item_code.not.ilike.DEMO-%),item_code.is.null');

    const s = debouncedSearch.trim().replace(/[,()%]/g, '');
    if (s) {
      const { data: matchedDeposits } = await supabase
        .from('deposits')
        .select('id')
        .or(`tracking_id.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
      const depositIds = (matchedDeposits || []).map((d: any) => d.id);

      if (depositIds.length > 0) {
        query = query.or(`item_name.ilike.%${s}%,item_code.ilike.%${s}%,storage_location.ilike.%${s}%,deposit_id.in.(${depositIds.join(',')})`);
      } else {
        query = query.or(`item_name.ilike.%${s}%,item_code.ilike.%${s}%,storage_location.ilike.%${s}%`);
      }
    }

    let data: DepositItem[] = [];
    try {
      data = await fetchAllSupabaseRows<DepositItem>(async (from, to) => {
        const { data: pageRows, error } = await query.range(from, to);
        return { data: pageRows as unknown as DepositItem[], error };
      });
    } catch (error) {
      console.error('[inventory summary] fetch failed:', error);
      setSummaryItems([]);
      setSummaryLoading(false);
      return;
    }

    const groups = new Map<string, {
      key: string; item_name: string; item_code: string; unit: string;
      totalRemaining: number; totalQuantity: number; trackingCount: number;
      locations: Set<string>; anyActive: boolean; items: DepositItem[];
    }>();

    data.forEach((item: any) => {
      const codeKey = (item.item_code || '').trim().toLowerCase();
      const nameKey = (item.item_name || '').trim().toLowerCase();
      // จัดกลุ่มตามรหัสสินค้าก่อนถ้ามี ไม่งั้นใช้ชื่อสินค้าแทน
      const key = codeKey ? `code:${codeKey}` : `name:${nameKey}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          item_name: item.item_name || '—',
          item_code: item.item_code || '',
          unit: item.unit || '',
          totalRemaining: 0,
          totalQuantity: 0,
          trackingCount: 0,
          locations: new Set<string>(),
          anyActive: false,
          items: [],
        });
      }
      const g = groups.get(key)!;
      g.totalRemaining += Number(item.remaining_quantity) || 0;
      g.totalQuantity += Number(item.quantity) || 0;
      g.trackingCount += 1;
      if (item.storage_location) g.locations.add(displayStorageLocation(item.storage_location));
      if (!g.item_code && item.item_code) g.item_code = item.item_code;
      const isReturned = item.status === 'คืนแล้ว' || item.remaining_quantity <= 0;
      if (!isReturned) g.anyActive = true;
      g.items.push(item);
    });

    const grouped = Array.from(groups.values())
      .map(g => ({ ...g, locations: Array.from(g.locations) }))
      .sort((a, b) => b.totalRemaining - a.totalRemaining || a.item_name.localeCompare(b.item_name, 'th'));

    setSummaryItems(grouped);
    setSummaryLoading(false);
  }, [statusFilter, demoFilter, debouncedSearch]);

  const handlePrint = (item: DepositItem) => {
    const isReturned = item.status === 'คืนแล้ว' || item.remaining_quantity <= 0;
    const w = 800, h = 900;
    if (isReturned) {
      supabase.from('withdrawals').select('id').eq('deposit_item_id', item.id)
        .order('id', { ascending: false }).limit(1).single()
        .then(({ data }) => {
          if (data) window.open(`/print-withdraw/${data.id}`, 'PrintPopup', `width=${w},height=${h},top=${window.screen.height/2-h/2},left=${window.screen.width/2-w/2},scrollbars=yes,status=no,toolbar=no,menubar=no`);
        });
    } else {
      window.open(`/print/${item.id}`, 'PrintPopup', `width=${w},height=${h},top=${window.screen.height/2-h/2},left=${window.screen.width/2-w/2},scrollbars=yes,status=no,toolbar=no,menubar=no`);
    }
  };

  const openHistory = async (item: DepositItem) => {
    setHistoryItem(item);
    setHistoryLoading(true);
    setHistoryData([]);
    setLocationHistory([]);
    const [withdrawalsResponse, movementsResponse] = await Promise.all([
      supabase
        .from('withdrawals')
        .select('*')
        .eq('deposit_item_id', item.id)
        .order('withdraw_date', { ascending: false }),
      supabase
        .from('warehouse_location_movements')
        .select('id, from_location, to_location, moved_by, moved_at')
        .eq('deposit_item_id', item.id)
        .order('moved_at', { ascending: false }),
    ]);
    if (!withdrawalsResponse.error) {
      setHistoryData((withdrawalsResponse.data as WithdrawalHistory[]) || []);
    }
    if (!movementsResponse.error) {
      setLocationHistory((movementsResponse.data as WarehouseLocationMovement[]) || []);
    }
    setHistoryLoading(false);
  };

  const openEdit = (item: DepositItem) => {
    const currentBin = warehouseBins.find((bin) => bin.id === item.warehouse_bin_id);
    const canonicalBin = currentBin
      ? getRackBins(warehouseBins, currentBin.rackId).find((bin) => bin.shelfLevel === currentBin.shelfLevel)
      : undefined;
    setEditItem(item);
    setEditForm({
      item_name: item.item_name || '',
      item_code: item.item_code || '',
      detail: item.detail || '',
      quantity: item.quantity,
      unit: item.unit || '',
      storage_location: item.storage_location || '',
      warehouse_zone_id: item.warehouse_zone_id || '',
      warehouse_rack_id: item.warehouse_rack_id || '',
      warehouse_bin_id: canonicalBin?.id || item.warehouse_bin_id || '',
      customer_name: (item.deposits as any)?.customer_name || '',
      customer_phone: (item.deposits as any)?.customer_phone || '',
    });
  };

  const handleEditSave = async () => {
    if (!editItem) return;
    setEditLoading(true);
    try {
      const selectedZone = warehouseZones.find(zone => zone.id === editForm.warehouse_zone_id);
      const selectedRack = warehouseRacks.find(rack => rack.id === editForm.warehouse_rack_id);
      const selectedBin = warehouseBins.find(bin => bin.id === editForm.warehouse_bin_id);
      if (!selectedZone || !selectedRack || !selectedBin) {
        throw new Error('กรุณาเลือกโซน, Rack และชั้นให้ครบ');
      }
      const alreadyReturned = Math.max(0, editItem.quantity - editItem.remaining_quantity);
      if (editForm.quantity < alreadyReturned) {
        throw new Error(`จำนวนทั้งหมดต้องไม่น้อยกว่าจำนวนที่คืนไปแล้ว ${alreadyReturned} ${editItem.unit}`);
      }
      const nextRemaining = editForm.quantity - alreadyReturned;
      const exactLocation = formatWarehousePlacement(selectedZone, selectedRack, selectedBin);
      const { error: itemErr } = await supabase.from('deposit_items').update({
        item_name: editForm.item_name,
        item_code: editForm.item_code || null,
        detail: editForm.detail,
        quantity: editForm.quantity,
        remaining_quantity: nextRemaining,
        status: nextRemaining <= 0 ? 'คืนแล้ว' : 'กำลังฝาก',
        unit: editForm.unit,
        warehouse_zone_id: editForm.warehouse_zone_id,
        warehouse_rack_id: editForm.warehouse_rack_id,
        warehouse_bin_id: editForm.warehouse_bin_id,
        storage_location: exactLocation,
      }).eq('id', editItem.id);
      if (itemErr) throw itemErr;

      const depositId = (editItem.deposits as any)?.id ?? (editItem as any).deposit_id;
      if (depositId) {
        const { error: depErr } = await supabase.from('deposits').update({
          customer_name: editForm.customer_name,
          customer_phone: editForm.customer_phone,
        }).eq('id', depositId);
        if (depErr) throw depErr;
      }

      toast('แก้ไขข้อมูลสำเร็จ!', 'success');
      setEditItem(null);
      await fetchItems();
    } catch (err: any) {
      toast('เกิดข้อผิดพลาด: ' + (err?.message || 'ไม่ทราบสาเหตุ'), 'error');
    }
    setEditLoading(false);
  };

  const handleExportCSV = async () => {
    setExportLoading(true);
    let data: DepositItem[];
    try {
      data = await fetchAllSupabaseRows<DepositItem>(async (from, to) => {
        let query = supabase
          .from('deposit_items')
          .select('*, deposits(tracking_id, customer_name, customer_phone, deposit_date, staff_received_name)')
          .order('id', { ascending: false });
        if (demoFilter === 'demo') query = query.or('item_code.ilike.MOCK-%,item_code.ilike.DEMO-%');
        else if (demoFilter === 'real') query = query.or('and(item_code.not.ilike.MOCK-%,item_code.not.ilike.DEMO-%),item_code.is.null');
        const { data: pageRows, error } = await query.range(from, to);
        return { data: pageRows as unknown as DepositItem[], error };
      });
    } catch (error) {
      toast('Export ไม่สำเร็จ: ' + (error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'), 'error');
      setExportLoading(false);
      return;
    }

    const rows = [
      ['Tracking ID', 'ชื่อผู้ฝาก', 'เบอร์โทร', 'วันที่รับฝาก', 'พนักงานผู้รับฝาก', 'ชื่อสิ่งของ', 'รหัสสินค้า', 'รายละเอียด', 'จำนวนทั้งหมด', 'คงเหลือ', 'หน่วย', 'ตำแหน่งเก็บ', 'สถานะ'],
      ...data.map((item: any) => [
        item.deposits?.tracking_id || '',
        item.deposits?.customer_name || '',
        item.deposits?.customer_phone || '',
        item.deposits?.deposit_date ? item.deposits.deposit_date.split('T')[0] : '',
        item.deposits?.staff_received_name || '',
        item.item_name || '',
        item.item_code || '',
        item.detail || '',
        item.quantity,
        item.remaining_quantity,
        item.unit || '',
        displayStorageLocation(item.storage_location),
        item.status || (item.remaining_quantity <= 0 ? 'คืนแล้ว' : 'กำลังฝาก'),
      ]),
    ];

    const csvContent = '\uFEFF' + rows.map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-inventory-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportLoading(false);
    toast('Export CSV สำเร็จ!', 'success');
  };

  const filtered = items;

  const fetchGlobalCounts = useCallback(async () => {
    let activeQuery = supabase.from('deposit_items').select('*', { count: 'exact', head: true })
      .neq('status', 'คืนแล้ว').gt('remaining_quantity', 0);
    let returnedQuery = supabase.from('deposit_items').select('*', { count: 'exact', head: true })
      .or('status.eq.คืนแล้ว,remaining_quantity.lte.0');
    if (demoFilter !== 'all') {
      if (demoFilter === 'demo') {
        activeQuery = activeQuery.or('item_code.ilike.MOCK-%,item_code.ilike.DEMO-%');
        returnedQuery = returnedQuery.or('item_code.ilike.MOCK-%,item_code.ilike.DEMO-%');
      } else {
        activeQuery = activeQuery.or('and(item_code.not.ilike.MOCK-%,item_code.not.ilike.DEMO-%),item_code.is.null');
        returnedQuery = returnedQuery.or('and(item_code.not.ilike.MOCK-%,item_code.not.ilike.DEMO-%),item_code.is.null');
      }
    }
    const [{ count: active }, { count: returned }] = await Promise.all([activeQuery, returnedQuery]);
    setActiveCount(active ?? 0);
    setReturnedCount(returned ?? 0);
  }, [demoFilter]);

  useEffect(() => { void fetchItems(); }, [fetchItems]);
  useEffect(() => { void fetchGlobalCounts(); }, [fetchGlobalCounts]);
  useEffect(() => {
    if (viewMode === 'summary') void fetchSummary();
  }, [viewMode, fetchSummary]);
  
  // คำนวณจำนวนหน้าทั้งหมดแปรผันตาม pageSize ล่าสุด
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="wh-page">
      <Toast toasts={toasts} onRemove={removeToast} />

      {/* Header - บังคับเนื้อหาชิดซ้ายสุดอย่างเป็นธรรมชาติเรียบร้อยตามต้นฉบับเดิม */}
      <div className="wh-page-header" style={{ marginBottom: 20, width: '100%' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 className="wh-page-title" style={{ textAlign: 'left', margin: 0 }}>รายการสิ่งของในคลัง
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={exportLoading}
              className="wh-btn"
              style={{ padding: '8px 18px', fontSize: 13, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, marginLeft: 'auto', height: 38 }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {exportLoading ? 'กำลัง Export...' : 'Export CSV'}
            </button></h1>
          <p className="wh-page-sub" style={{ textAlign: 'left', margin: '4px 0 0 0' }}>
            ทั้งหมด {totalCount} รายการ &nbsp;·&nbsp;
            <span style={{ color: 'var(--sp-success)', fontWeight: 700 }}>กำลังฝาก {activeCount}</span>
            &nbsp;·&nbsp;
            <span style={{ color: 'var(--sp-text3)' }}>คืนแล้ว {returnedCount}</span>
          </p>
        </div>
      </div>

      {/* Search & filter - แถวเครื่องมือที่รวบรวมฟังก์ชัน ค้นหา, กรองสถานะ, จัดเรียง, แสดงแถว, รีเฟรช และปุ่ม Export สีเขียวไว้ที่เดียวกัน */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div className="wh-search-wrap" style={{ flex: '1 1 220px', minWidth: 200, position: 'relative' }}>
          <svg className="wh-search-icon" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" className="wh-search-input"
            placeholder="ค้นหาด้วยชื่อผู้ฝาก, เบอร์โทร, หรือ Tracking ID..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingRight: searchTerm ? 34 : 12 }}
          />
          {searchTerm && (
            <button type="button" className="wh-search-clear" onClick={() => setSearchTerm('')} title="ล้างการค้นหา">✕</button>
          )}
        </div>

        {/* ปุ่มเลือกสถานะ */}
        <div className="wh-flex-row" style={{ gap: 6 }}>
          {[
            { label: 'ทั้งหมด', cls: 'active-all' },
            { label: 'กำลังฝาก', cls: 'active-active' },
            { label: 'คืนแล้ว', cls: 'active-returned' },
          ].map(({ label, cls }) => (
            <button key={label} onClick={() => setStatusFilter(label)}
              className={`wh-filter-pill${statusFilter === label ? ' ' + cls : ''}`}>
              {label === 'กำลังฝาก' && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#22c55e', marginRight: 5 }} />}
              {label === 'คืนแล้ว' && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#818cf8', marginRight: 5 }} />}
              {label}
            </button>
          ))}
        </div>

        <select
          aria-label="กรองข้อมูลจริงหรือข้อมูลตัวอย่าง"
          value={demoFilter}
          onChange={(event) => setDemoFilter(event.target.value as 'all' | 'real' | 'demo')}
          className="wh-select"
          style={{ width: 'auto', fontSize: 13, padding: '7px 10px' }}
        >
          <option value="all">ข้อมูลจริง + ตัวอย่าง</option>
          <option value="real">เฉพาะข้อมูลจริง</option>
          <option value="demo">เฉพาะข้อมูลตัวอย่าง</option>
        </select>

        {/* สลับมุมมอง: แยกตามแท็กกิ้ง / สรุปยอดรวมตามสินค้า */}
        <div className="wh-flex-row" style={{ gap: 4, background: '#eef2f7', padding: 3, borderRadius: 9 }}>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            style={{
              padding: '7px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 7, border: 'none', cursor: 'pointer',
              background: viewMode === 'list' ? '#fff' : 'transparent',
              color: viewMode === 'list' ? 'var(--sp-navy)' : 'var(--sp-text3)',
              boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            แยกรายการ
          </button>
          <button
            type="button"
            onClick={() => setViewMode('summary')}
            style={{
              padding: '7px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 7, border: 'none', cursor: 'pointer',
              background: viewMode === 'summary' ? '#fff' : 'transparent',
              color: viewMode === 'summary' ? 'var(--sp-navy)' : 'var(--sp-text3)',
              boxShadow: viewMode === 'summary' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            สรุปยอดสินค้า
          </button>
        </div>

        {/* ตัวเลือกจัดเรียงลำดับข้อมูล + จำนวนรายการต่อหน้า */}
        {viewMode === 'list' ? (
          <>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d9e2ec', background: '#f0f4f8', fontSize: 13, color: '#334e68', cursor: 'pointer', outline: 'none' }}
            >
              <option value="newest">เรียงตาม: วันใหม่สุด</option>
              <option value="oldest">เรียงตาม: วันเก่าสุด</option>
            </select>

            {/* ตัวเลือกจำนวนรายการที่แสดงผลต่อหน้า */}
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d9e2ec', background: '#f0f4f8', fontSize: 13, color: '#334e68', cursor: 'pointer', outline: 'none' }}
            >
              <option value={10}>แสดง 10 รายการ</option>
              <option value={20}>แสดง 20 รายการ</option>
              <option value={30}>แสดง 30 รายการ</option>
              <option value={50}>แสดง 50 รายการ</option>
            </select>
          </>
        ) : (
          <select
            value={summaryPageSize}
            onChange={e => { setSummaryPageSize(Number(e.target.value)); setSummaryPage(0); }}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d9e2ec', background: '#f0f4f8', fontSize: 13, color: '#334e68', cursor: 'pointer', outline: 'none' }}
          >
            <option value={10}>แสดง 10 รายการ</option>
            <option value={20}>แสดง 20 รายการ</option>
            <option value={30}>แสดง 30 รายการ</option>
            <option value={50}>แสดง 50 รายการ</option>
          </select>
        )}

        {/* ปุ่มรีเฟรชข้อมูล */}
        <button
          type="button"
          onClick={() => { if (viewMode === 'summary') fetchSummary(); else fetchItems(); fetchGlobalCounts(); }}
          disabled={loading || summaryLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8,
            border: '1px solid #d9e2ec', background: '#fff', fontSize: 13, color: '#334e68', fontWeight: 500, cursor: 'pointer', height: 38
          }}
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ animation: (loading || summaryLoading) ? 'spin 1s linear infinite' : 'none' }}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
          รีเฟรช
        </button>
      </div>

      {/* Table */}
      {viewMode === 'summary' ? (() => {
        const summaryTotalPages = Math.max(1, Math.ceil(summaryItems.length / summaryPageSize));
        const pagedSummaryItems = summaryItems.slice(summaryPage * summaryPageSize, summaryPage * summaryPageSize + summaryPageSize);
        return (
        <div className="wh-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="wh-table-wrap">
            <table className="wh-table">
              <thead>
                <tr>
                  <th>ชื่อสินค้า</th>
                  <th>รหัสสินค้า</th>
                  <th style={{ textAlign: 'center' }}>คงเหลือรวมในคลัง</th>
                  <th style={{ textAlign: 'center' }}>รับฝากรวมสะสม</th>
                  <th style={{ textAlign: 'center' }}>จำนวนแท็กกิ้งที่เกี่ยวข้อง</th>
                  <th>ตำแหน่งจัดเก็บ</th>
                  <th style={{ textAlign: 'center' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {summaryLoading ? (
                  <tr><td colSpan={7} className="wh-empty-row">กำลังโหลดข้อมูล...</td></tr>
                ) : summaryItems.length === 0 ? (
                  <tr><td colSpan={7} className="wh-empty-row">ไม่พบข้อมูลที่ค้นหา</td></tr>
                ) : pagedSummaryItems.map(g => (
                  <tr key={g.key}>
                    <td style={{ fontWeight: 700, color: 'var(--sp-text)' }}>{g.item_name}</td>
                    <td>
                      {g.item_code
                        ? <span className="wh-mono" style={{ color: 'var(--sp-blue-md)', fontWeight: 800, fontSize: 12.5, background: '#deeafa', padding: '3px 8px', borderRadius: 6 }}>{g.item_code}</span>
                        : <span style={{ color: 'var(--sp-text3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: g.totalRemaining > 0 ? 'var(--sp-blue)' : 'var(--sp-text3)' }}>
                        {g.totalRemaining} {g.unit}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--sp-text2)' }}>{g.totalQuantity} {g.unit}</td>
                    <td style={{ textAlign: 'center', color: 'var(--sp-text2)' }}>{g.trackingCount}</td>
                    <td style={{ color: 'var(--sp-text2)', fontSize: 13 }}>{g.locations.length ? g.locations.join(', ') : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="wh-flex-row" style={{ justifyContent: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <button onClick={() => setBreakdownGroup(g)} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12, background: '#deeafa', color: 'var(--sp-blue)', border: '1px solid #b3d0f0', borderRadius: 7 }}>
                          ดูรายการย่อย
                        </button>
                        {g.anyActive && (
                          <button
                            onClick={() => router.push(`/main/withdraw?q=${encodeURIComponent(g.item_code || g.item_name)}`)}
                            className="wh-btn"
                            style={{ padding: '5px 10px', fontSize: 12, background: '#dcfce7', color: 'var(--sp-success)', border: '1px solid #bbf7d0', borderRadius: 7 }}
                          >
                            คืนสินค้า
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination — โหมดสรุปยอด */}
          {summaryTotalPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1.5px solid var(--sp-bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--sp-text3)' }}>
                หน้า {summaryPage + 1} / {summaryTotalPages} &nbsp;(แสดง {summaryPage * summaryPageSize + 1}–{Math.min((summaryPage + 1) * summaryPageSize, summaryItems.length)} จาก {summaryItems.length} รายการ)
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setSummaryPage(p => Math.max(0, p - 1))} disabled={summaryPage === 0} className="wh-btn wh-btn-ghost" style={{ padding: '6px 14px', fontSize: 13, opacity: summaryPage === 0 ? 0.4 : 1 }}>← ก่อนหน้า</button>
                <button onClick={() => setSummaryPage(p => Math.min(summaryTotalPages - 1, p + 1))} disabled={summaryPage >= summaryTotalPages - 1} className="wh-btn wh-btn-ghost" style={{ padding: '6px 14px', fontSize: 13, opacity: summaryPage >= summaryTotalPages - 1 ? 0.4 : 1 }}>ถัดไป →</button>
              </div>
            </div>
          )}
        </div>
        );
      })() : (
      <div className="wh-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="wh-table-wrap">
          <table className="wh-table">
            <thead>
              <tr>
                <th style={{ width: 60, textAlign: 'center' }}>รูป</th>
                <th>Tracking ID</th>
                <th>ผู้ฝาก</th>
                <th>รายละเอียดของ</th>
                <th>ตำแหน่งเก็บ</th>
                <th style={{ textAlign: 'center' }}>สถานะ</th>
                <th style={{ textAlign: 'center' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="wh-empty-row">กำลังโหลดข้อมูล...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="wh-empty-row">ไม่พบข้อมูลที่ค้นหา</td></tr>
              ) : filtered.map((item) => {
                const isReturned = item.status === 'คืนแล้ว' || item.remaining_quantity <= 0;
                const pct = Math.round((item.remaining_quantity / item.quantity) * 100);
                return (
                  <tr key={item.id}>
                    <td style={{ textAlign: 'center' }}>
                      {item.item_image_url ? (
                        <img
                          src={item.item_image_url} alt=""
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--sp-border)', cursor: 'pointer', transition: 'transform 0.15s' }}
                          onClick={() => setViewingItem(item)}
                          onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.08)')}
                          onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        />
                      ) : (
                        <div style={{ width: 44, height: 44, background: 'var(--sp-bg2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8.5, color: 'var(--sp-text3)', border: '1.5px dashed var(--sp-border)', margin: '0 auto', letterSpacing: 0.3 }}>ไม่มีรูป</div>
                      )}
                    </td>
                    <td>
                      <span className="wh-mono" style={{ color: 'var(--sp-blue-md)', fontWeight: 800, fontSize: 12.5, background: '#deeafa', padding: '3px 8px', borderRadius: 6 }}>
                        {(item.deposits as any)?.tracking_id}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--sp-text)' }}>{(item.deposits as any)?.customer_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--sp-text3)', marginTop: 2 }}>{(item.deposits as any)?.customer_phone || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--sp-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {item.item_name}
                        {item.item_code && <span className="wh-mono" style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--sp-text3)', background: 'var(--sp-bg2)', padding: '1px 6px', borderRadius: 5 }}>{item.item_code}</span>}
                      </div>
                      {displayItemDetail(item.detail) && <div style={{ fontSize: 12, color: 'var(--sp-text3)', marginTop: 2 }}>{displayItemDetail(item.detail)}</div>}
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ flex: 1, background: 'var(--sp-bg2)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: isReturned ? 'var(--sp-text3)' : 'linear-gradient(90deg,var(--sp-blue),var(--sp-blue-lt))', borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: isReturned ? 'var(--sp-text3)' : 'var(--sp-blue)', whiteSpace: 'nowrap' }}>
                          {item.remaining_quantity}/{item.quantity} {item.unit}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--sp-text2)', fontSize: 13 }}>{displayStorageLocation(item.storage_location) || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      {isReturned
                        ? <span className="wh-badge wh-badge-returned">คืนแล้ว</span>
                        : <span className="wh-badge wh-badge-active">
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sp-success)', display: 'inline-block', animation: 'pulse 2s ease infinite' }} />
                            กำลังฝาก
                          </span>
                      }
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="wh-flex-row" style={{ justifyContent: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <button onClick={() => setViewingItem(item)} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12, background: '#deeafa', color: 'var(--sp-blue)', border: '1px solid #b3d0f0', borderRadius: 7 }}>
                          ดูข้อมูล
                        </button>
                        <button onClick={() => openHistory(item)} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 7 }}>
                          ประวัติ
                        </button>
                        <button onClick={() => openEdit(item)} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12, background: 'var(--sp-gold-bg)', color: '#92400e', border: '1px solid #f0d99a', borderRadius: 7 }}>
                          แก้ไข
                        </button>
                        <button onClick={() => handlePrint(item)} className="wh-btn" style={{
                          padding: '5px 10px', fontSize: 12, borderRadius: 7,
                          background: isReturned ? '#f5f3ff' : '#dcfce7',
                          color: isReturned ? '#7c3aed' : 'var(--sp-success)',
                          border: `1px solid ${isReturned ? '#ddd6fe' : '#bbf7d0'}`,
                        }}>
                          {isReturned ? 'ปริ้นใบคืน' : 'ปริ้นใบฝาก'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '12px 20px', borderTop: '1.5px solid var(--sp-bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--sp-text3)' }}>
              หน้า {page + 1} / {totalPages} &nbsp;(แสดง {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} จาก {totalCount} รายการ)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="wh-btn wh-btn-ghost" style={{ padding: '6px 14px', fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>← ก่อนหน้า</button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="wh-btn wh-btn-ghost" style={{ padding: '6px 14px', fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>ถัดไป →</button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── Breakdown Modal (จากมุมมองสรุป: แสดงรายการย่อยตามแท็กกิ้ง) ── */}
      {breakdownGroup && (
        <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBreakdownGroup(null); }}>
          <div className="wh-modal" style={{ maxWidth: 640 }}>
            <div className="wh-modal-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="var(--sp-gold)" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18M3 9v10a2 2 0 0 0 2 2h4M21 9v10a2 2 0 0 1-2 2h-4"/>
                </svg>
                {breakdownGroup.item_name} — รายการย่อยตามแท็กกิ้ง
              </span>
              <button className="wh-modal-close" onClick={() => setBreakdownGroup(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1, background: '#deeafa', borderRadius: 9, padding: '10px 14px', textAlign: 'center', border: '1px solid #b3d0f0' }}>
                <div style={{ fontSize: 11, color: 'var(--sp-text3)', fontWeight: 700, letterSpacing: 0.5 }}>คงเหลือรวม</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--sp-blue)', lineHeight: 1.2 }}>{breakdownGroup.totalRemaining} {breakdownGroup.unit}</div>
              </div>
              <div style={{ flex: 1, background: 'var(--sp-bg)', borderRadius: 9, padding: '10px 14px', textAlign: 'center', border: '1px solid var(--sp-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--sp-text3)', fontWeight: 700, letterSpacing: 0.5 }}>จำนวนแท็กกิ้ง</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--sp-text)', lineHeight: 1.2 }}>{breakdownGroup.trackingCount}</div>
              </div>
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {breakdownGroup.items.map((item: any) => {
                const isReturned = item.status === 'คืนแล้ว' || item.remaining_quantity <= 0;
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: isReturned ? 'var(--sp-bg)' : '#f8fbff', border: `1px solid ${isReturned ? 'var(--sp-border)' : '#d0e4f7'}`, borderRadius: 9, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <span className="wh-mono" style={{ color: 'var(--sp-blue-md)', fontWeight: 800, fontSize: 12, background: '#deeafa', padding: '2px 8px', borderRadius: 6 }}>
                        {(item.deposits as any)?.tracking_id}
                      </span>
                      <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--sp-text2)' }}>{(item.deposits as any)?.customer_name || '—'}</div>
                      <div style={{ fontSize: 12, marginTop: 2, fontWeight: 700, color: isReturned ? 'var(--sp-text3)' : 'var(--sp-blue)' }}>
                        {item.remaining_quantity}/{item.quantity} {item.unit}
                        {item.storage_location && <span style={{ fontWeight: 400, color: 'var(--sp-text3)' }}> · 📍 {displayStorageLocation(item.storage_location)}</span>}
                      </div>
                    </div>
                    <div className="wh-flex-row" style={{ gap: 5, flexWrap: 'wrap' }}>
                      <button onClick={() => { setViewingItem(item); setBreakdownGroup(null); }} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12, background: '#deeafa', color: 'var(--sp-blue)', border: '1px solid #b3d0f0', borderRadius: 7 }}>
                        ดูข้อมูล
                      </button>
                      <button onClick={() => { openHistory(item); setBreakdownGroup(null); }} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 7 }}>
                        ประวัติ
                      </button>
                      <button onClick={() => { openEdit(item); setBreakdownGroup(null); }} className="wh-btn" style={{ padding: '5px 10px', fontSize: 12, background: 'var(--sp-gold-bg)', color: '#92400e', border: '1px solid #f0d99a', borderRadius: 7 }}>
                        แก้ไข
                      </button>
                      <button onClick={() => handlePrint(item)} className="wh-btn" style={{
                        padding: '5px 10px', fontSize: 12, borderRadius: 7, fontWeight: 700,
                        background: isReturned ? '#f5f3ff' : '#dcfce7',
                        color: isReturned ? '#7c3aed' : 'var(--sp-success)',
                        border: `1px solid ${isReturned ? '#ddd6fe' : '#bbf7d0'}`,
                      }}>
                        {isReturned ? 'ปริ้นใบคืน' : 'ปริ้นใบฝาก'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
              {breakdownGroup.anyActive && (
                <button
                  onClick={() => router.push(`/main/withdraw?q=${encodeURIComponent(breakdownGroup.item_code || breakdownGroup.item_name)}`)}
                  className="wh-btn wh-btn-primary" style={{ flex: 1 }}
                >
                  คืนสินค้า — เลือกแท็กกิ้ง →
                </button>
              )}
              <button onClick={() => setBreakdownGroup(null)} className="wh-btn wh-btn-ghost" style={{ flex: 1 }}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Modal ── */}
      {historyItem && (
        <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setHistoryItem(null); }}>
          <div className="wh-modal" style={{ maxWidth: 560 }}>
            <div className="wh-modal-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="#7c3aed" strokeWidth="2.5" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                ประวัติสินค้า
              </span>
              <button className="wh-modal-close" onClick={() => setHistoryItem(null)}>✕</button>
            </div>

            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: 'var(--sp-navy)', fontSize: 14 }}>{historyItem.item_name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--sp-text3)', marginTop: 3 }}>
                คงเหลือ: <strong style={{ color: '#7c3aed' }}>{historyItem.remaining_quantity}/{historyItem.quantity} {historyItem.unit}</strong>
                &nbsp;·&nbsp; คืนแล้ว: <strong>{historyItem.quantity - historyItem.remaining_quantity} {historyItem.unit}</strong>
              </div>
            </div>

            <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 800, color: 'var(--sp-text2)' }}>ประวัติการคืนสินค้า</div>
            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--sp-text3)', fontSize: 13 }}>กำลังโหลดประวัติ...</div>
            ) : historyData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--sp-text3)', fontSize: 13 }}>
                <svg width="36" height="36" fill="none" stroke="var(--sp-border)" strokeWidth="1.5" viewBox="0 0 24 24" style={{ display: 'block', margin: '0 auto 10px' }}>
                  <circle cx="12" cy="12" r="10"/><path d="M8 15s1.5-2 4-2 4 2 4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
                ยังไม่มีประวัติการคืนสินค้า
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
                {historyData.map((w, idx) => {
                  const d = w.withdraw_date ? new Date(w.withdraw_date) : null;
                  const dateStr = d ? `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}` : '—';
                  const timeStr = d ? `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')} น.` : '';
                  return (
                    <div key={w.id} style={{ display: 'flex', gap: 12, padding: '12px 14px', background: idx === 0 ? '#f5f3ff' : 'var(--sp-bg)', border: `1px solid ${idx === 0 ? '#ddd6fe' : 'var(--sp-border)'}`, borderLeft: `3px solid ${idx === 0 ? '#7c3aed' : 'var(--sp-border)'}`, borderRadius: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: idx === 0 ? '#7c3aed' : 'var(--sp-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" fill="none" stroke={idx === 0 ? '#fff' : 'var(--sp-text3)'} strokeWidth="2.2" viewBox="0 0 24 24">
                          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--sp-navy)' }}>
                              คืน {w.withdraw_quantity} {historyItem.unit}
                            </span>
                            {idx === 0 && <span style={{ marginLeft: 8, fontSize: 10.5, background: '#7c3aed', color: '#fff', padding: '1px 7px', borderRadius: 99, fontWeight: 700 }}>ล่าสุด</span>}
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 11.5, color: 'var(--sp-text3)' }}>
                            <div>{dateStr}</div>
                            <div>{timeStr}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--sp-text2)', marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span>
                            <span style={{ color: 'var(--sp-text3)' }}>พนักงาน:</span>{' '}
                            <strong>{w.staff_signature_name || '—'}</strong>
                          </span>
                          {w.remark && w.remark !== 'คืนสินค้าเรียบร้อยแล้ว' && (
                            <span>
                              <span style={{ color: 'var(--sp-text3)' }}>หมายเหตุ:</span>{' '}{w.remark}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!historyLoading && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--sp-border)' }}>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 800, color: 'var(--sp-text2)' }}>ประวัติการย้ายตำแหน่ง</div>
                {locationHistory.length === 0 ? (
                  <div style={{ padding: '14px', border: '1px dashed var(--sp-border)', borderRadius: 10, color: 'var(--sp-text3)', fontSize: 12.5, textAlign: 'center' }}>
                    ยังไม่มีประวัติการย้ายสินค้า
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {locationHistory.map((movement, idx) => {
                      const movedAt = new Date(movement.moved_at);
                      const dateTime = `${movedAt.getDate()}/${movedAt.getMonth() + 1}/${movedAt.getFullYear() + 543} ${movedAt.getHours().toString().padStart(2, '0')}:${movedAt.getMinutes().toString().padStart(2, '0')} น.`;
                      return (
                        <div key={movement.id} style={{ padding: '11px 13px', border: '1px solid var(--sp-border)', borderLeft: `3px solid ${idx === 0 ? '#2563eb' : 'var(--sp-border)'}`, borderRadius: 10, background: idx === 0 ? '#eff6ff' : 'var(--sp-bg)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11.5, color: 'var(--sp-text3)' }}>
                            <span>{idx === 0 ? 'ย้ายล่าสุด' : 'ย้ายตำแหน่ง'}</span>
                            <span>{dateTime}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginTop: 7, fontSize: 12.5 }}>
                            <span style={{ color: 'var(--sp-text3)' }}>{movement.from_location || 'ไม่ระบุตำแหน่งเดิม'}</span>
                            <span style={{ color: '#2563eb', fontWeight: 800 }}>→</span>
                            <strong style={{ color: 'var(--sp-navy)' }}>{movement.to_location || 'ไม่ระบุตำแหน่งใหม่'}</strong>
                          </div>
                          {movement.moved_by && movement.moved_by !== 'system' && (
                            <div style={{ marginTop: 5, fontSize: 11, color: 'var(--sp-text3)' }}>โดย {movement.moved_by}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setHistoryItem(null)} className="wh-btn wh-btn-ghost" style={{ padding: '8px 20px' }}>ปิด</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editItem && (
        <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditItem(null); }}>
          <div className="wh-modal" style={{ maxWidth: 520 }}>
            <div className="wh-modal-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="var(--sp-gold)" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                แก้ไขข้อมูล
              </span>
              <button className="wh-modal-close" onClick={() => setEditItem(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--sp-bg)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--sp-border)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--sp-text3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>ข้อมูลผู้ฝาก</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">ชื่อ-นามสกุล ผู้ฝาก</label>
                    <input className="wh-input" value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">เบอร์โทรศัพท์</label>
                    <input className="wh-input" value={editForm.customer_phone} onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--sp-bg)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--sp-border)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--sp-text3)', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>ข้อมูลสินค้า</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">ชื่อสิ่งของ</label>
                    <input className="wh-input" value={editForm.item_name} onChange={e => setEditForm(f => ({ ...f, item_name: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">รหัสสินค้า</label>
                    <input className="wh-input" value={editForm.item_code} onChange={e => setEditForm(f => ({ ...f, item_code: e.target.value }))} placeholder="เช่น SKU-001 (ถ้ามี)" />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">ลักษณะเพิ่มเติม</label>
                    <input className="wh-input" value={editForm.detail} onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))} />
                  </div>
                  <div>
                    <label className="wh-label">จำนวน (ทั้งหมด)</label>
                    <input className="wh-input" type="number" min={editItem.quantity - editItem.remaining_quantity} value={editForm.quantity} onChange={e => setEditForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <label className="wh-label">หน่วย</label>
                    <input className="wh-input" value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">โซนบนผังคลัง</label>
                    <select
                      className="wh-select"
                      value={editForm.warehouse_zone_id}
                      onChange={e => {
                        setEditForm(f => ({
                          ...f,
                          warehouse_zone_id: e.target.value,
                          warehouse_rack_id: '',
                          warehouse_bin_id: '',
                        }));
                      }}
                      disabled={warehouseZones.length === 0}
                      required
                    >
                      <option value="">
                        {warehouseZones.length > 0 ? '— เลือกโซน —' : 'รอเชื่อมตารางผังใน Supabase'}
                      </option>
                      {warehouseZones.map(zone => (
                        <option key={zone.id} value={zone.id}>{zone.name} · {formatZoneLocation(zone)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="wh-label">Rack</label>
                    <select
                      className="wh-select"
                      value={editForm.warehouse_rack_id}
                      onChange={e => setEditForm(f => ({ ...f, warehouse_rack_id: e.target.value, warehouse_bin_id: '' }))}
                      disabled={!editForm.warehouse_zone_id}
                      required
                    >
                      <option value="">— เลือก Rack —</option>
                      {getZoneRacks(warehouseRacks, editForm.warehouse_zone_id).map(rack => (
                        <option key={rack.id} value={rack.id}>Rack {rack.rackNumber}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="wh-label">ชั้น</label>
                    <select
                      className="wh-select"
                      value={editForm.warehouse_bin_id}
                      onChange={e => setEditForm(f => ({ ...f, warehouse_bin_id: e.target.value }))}
                      disabled={!editForm.warehouse_rack_id}
                      required
                    >
                      <option value="">— เลือกตำแหน่ง —</option>
                      {getRackBins(warehouseBins, editForm.warehouse_rack_id).map(bin => (
                        <option key={bin.id} value={bin.id}>ชั้น {bin.shelfLevel}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="wh-label">พิกัดที่จะบันทึก</label>
                    <input
                      className="wh-input"
                      value={formatWarehousePlacement(
                        warehouseZones.find(zone => zone.id === editForm.warehouse_zone_id),
                        warehouseRacks.find(rack => rack.id === editForm.warehouse_rack_id),
                        warehouseBins.find(bin => bin.id === editForm.warehouse_bin_id),
                      )}
                      placeholder="เลือกโซน, Rack และชั้นให้ครบ"
                      readOnly
                    />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
              <button onClick={handleEditSave} disabled={editLoading} className="wh-btn wh-btn-gold wh-btn-full" style={{ flex: 2 }}>
                {editLoading ? 'กำลังบันทึก...' : (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    บันทึกการแก้ไข
                  </span>
                )}
              </button>
              <button onClick={() => setEditItem(null)} className="wh-btn wh-btn-ghost" style={{ flex: 1 }}>ยกเลิก</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {viewingItem && (
        <div className="wh-modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setViewingItem(null); setImgZoom(false); } }}>
          <div className="wh-modal" style={{ maxWidth: 520 }}>
            <div className="wh-modal-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" fill="none" stroke="var(--sp-gold)" strokeWidth="2.5" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                รายละเอียดรายการ
              </span>
              <button className="wh-modal-close" onClick={() => { setViewingItem(null); setImgZoom(false); }}>✕</button>
            </div>

            {viewingItem.item_image_url && (
              <div style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', cursor: 'zoom-in', position: 'relative' }}
                onClick={() => setImgZoom(z => !z)}>
                <img src={viewingItem.item_image_url} alt="" style={{ width: '100%', height: imgZoom ? 320 : 190, objectFit: 'cover', transition: 'height 0.3s ease', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 11 }}>
                  {imgZoom ? 'คลิกย่อ' : 'คลิกขยาย'}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <span className="wh-mono" style={{ background: 'linear-gradient(90deg,var(--sp-navy),var(--sp-blue))', color: '#fff', padding: '6px 20px', borderRadius: 99, fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>
                {(viewingItem.deposits as any)?.tracking_id}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { label: 'ชื่อผู้ฝาก', value: (viewingItem.deposits as any)?.customer_name },
                { label: 'เบอร์โทรศัพท์', value: (viewingItem.deposits as any)?.customer_phone || '—' },
                { label: 'พนักงานผู้รับฝาก', value: (viewingItem.deposits as any)?.staff_received_name || '—' },
                { label: 'รายละเอียดสิ่งของ', value: viewingItem.item_name },
                { label: 'รหัสสินค้า', value: viewingItem.item_code || '—' },
                { label: 'ลักษณะเพิ่มเติม', value: viewingItem.detail || '—' },
                { label: 'จำนวนคงเหลือ', value: `${viewingItem.remaining_quantity} / ${viewingItem.quantity} ${viewingItem.unit}` },
                { label: 'พิกัดจัดเก็บ', value: displayStorageLocation(viewingItem.storage_location) || '—' },
              ].map(row => (
                <div key={row.label} className="wh-info-row">
                  <span className="wh-info-label">{row.label}</span>
                  <span className="wh-info-value">{row.value}</span>
                </div>
              ))}
              <div className="wh-info-row">
                <span className="wh-info-label">สถานะ</span>
                {viewingItem.status === 'คืนแล้ว' || viewingItem.remaining_quantity <= 0
                  ? <span className="wh-badge wh-badge-returned">คืนแล้ว</span>
                  : <span className="wh-badge wh-badge-active">
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sp-success)', display: 'inline-block' }} />
                      กำลังฝาก
                    </span>
                }
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--sp-bg)', borderRadius: 10, border: '1px solid var(--sp-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--sp-text3)', marginBottom: 7, fontWeight: 600 }}>
                <span>จำนวนคืนแล้ว</span>
                <span style={{ color: 'var(--sp-blue)', fontWeight: 800 }}>{Math.round(((viewingItem.quantity - viewingItem.remaining_quantity) / viewingItem.quantity) * 100)}%</span>
              </div>
              <div style={{ background: 'var(--sp-bg2)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                <div style={{
                  width: `${((viewingItem.quantity - viewingItem.remaining_quantity) / viewingItem.quantity) * 100}%`,
                  height: '100%', borderRadius: 99,
                  background: 'linear-gradient(90deg,var(--sp-gold),var(--sp-gold-lt))',
                  transition: 'width 0.6s ease',
                }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: '1.25rem' }}>
              <button onClick={() => { openHistory(viewingItem); setViewingItem(null); }} className="wh-btn" style={{ flex: 1, padding: '9px', fontSize: 13, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', borderRadius: 9, fontWeight: 700 }}>
                ดูประวัติการคืน
              </button>
              <button onClick={() => handlePrint(viewingItem)} className="wh-btn wh-btn-primary" style={{ flex: 1 }}>
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                </svg>
                {viewingItem.status === 'คืนแล้ว' || viewingItem.remaining_quantity <= 0 ? 'พิมพ์ใบคืนสินค้า' : 'พิมพ์ใบรับฝาก'}
              </button>
              <button onClick={() => { setViewingItem(null); setImgZoom(false); }} className="wh-btn wh-btn-ghost" style={{ flex: 1 }}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
