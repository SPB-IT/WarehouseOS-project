'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { displayItemDetail, displayStorageLocation } from '../../lib/warehouseLocation';
import type { WarehouseZone } from './warehouse-map/types';
import {
  extractFloorLabel,
  extractLocationCode,
  extractRackNumber,
  loadWarehouseZones,
  WAREHOUSE_MAP_STORAGE_KEY,
  zoneMatchesStorageLocation,
} from './warehouse-map/warehouseMapData';
import {
  fetchWarehouseBins,
  fetchWarehouseRackCounts,
  fetchWarehouseRacks,
  fetchWarehouseZones,
  subscribeToWarehouseRacks,
  subscribeToWarehouseZones,
} from './warehouse-map/warehouseMapRepository';
import { getRackBins } from './warehouse-map/warehousePlacement';

const WarehouseMapCanvas = dynamic(() => import('./warehouse-map/WarehouseMapCanvas'), {
  ssr: false,
  loading: () => <div className="wp-map-loading">กำลังเปิดผังคลัง...</div>,
});

interface ProductSearchResult {
  id: number;
  item_name: string;
  item_code?: string | null;
  remaining_quantity: number;
  unit?: string | null;
  status?: string | null;
  storage_location?: string | null;
  warehouse_zone_id?: string | null;
  deposits?: {
    tracking_id?: string | null;
    customer_name?: string | null;
  } | null;
}

interface RackHoverTarget {
  zoneId: string;
  slotNumber: number;
}

interface RackHoverProduct {
  id: number;
  item_name: string;
  item_code?: string | null;
  quantity: number;
  remaining_quantity: number;
  unit?: string | null;
  status?: string | null;
  detail?: string | null;
  item_image_url?: string | null;
  storage_location?: string | null;
  warehouse_rack_id?: string | null;
  warehouse_bin_id?: string | null;
  deposits?: {
    tracking_id?: string | null;
    customer_name?: string | null;
    deposit_date?: string | null;
    staff_received_name?: string | null;
  } | null;
}

interface RackHoverPreview {
  key: string;
  loading: boolean;
  count: number;
  items: RackHoverProduct[];
  rackId?: string;
  binCapacity: number;
  error?: string;
}

interface RackProductGroup {
  key: string;
  itemName: string;
  itemCode: string;
  unit: string;
  totalRemaining: number;
  totalQuantity: number;
  shelfLevel: number;
  lots: RackHoverProduct[];
}

interface RackProductSection {
  key: string;
  shelfLevel: number;
  products: RackProductGroup[];
}

function extractShelfLevel(location: string | null | undefined) {
  return Number(location?.match(/ชั้น\s*(\d+)/)?.[1] ?? 0);
}

function buildRackSections(items: RackHoverProduct[], searchTerm: string, positionFilter: string) {
  const query = searchTerm.trim().toLocaleLowerCase('th');
  const groups = new Map<string, RackProductGroup>();

  items.forEach((item) => {
    const shelfLevel = extractShelfLevel(item.storage_location);
    const positionKey = `L${shelfLevel}`;
    if (positionFilter !== 'all' && positionFilter !== positionKey) return;
    if (query && !`${item.item_name} ${item.item_code ?? ''}`.toLocaleLowerCase('th').includes(query)) return;

    const skuKey = item.item_code?.trim().toLocaleLowerCase('th') || item.item_name.trim().toLocaleLowerCase('th');
    const key = `${positionKey}:${skuKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.totalRemaining += Number(item.remaining_quantity) || 0;
      existing.totalQuantity += Number(item.quantity) || 0;
      existing.lots.push(item);
      return;
    }

    groups.set(key, {
      key,
      itemName: item.item_name,
      itemCode: item.item_code ?? '',
      unit: item.unit ?? '',
      totalRemaining: Number(item.remaining_quantity) || 0,
      totalQuantity: Number(item.quantity) || 0,
      shelfLevel,
      lots: [item],
    });
  });

  const sections = new Map<string, RackProductSection>();
  groups.forEach((product) => {
    const key = `L${product.shelfLevel}`;
    const section = sections.get(key) ?? {
      key,
      shelfLevel: product.shelfLevel,
      products: [],
    };
    section.products.push(product);
    sections.set(key, section);
  });

  return Array.from(sections.values())
    .sort((a, b) => a.shelfLevel - b.shelfLevel)
    .map((section) => ({
      ...section,
      products: section.products.sort((a, b) => a.itemName.localeCompare(b.itemName, 'th')),
    }));
}

function Icon({ children, size = 18 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function WarehousePreviewPage() {
  const [zones, setZones] = useState<WarehouseZone[]>([]);
  const [rackCounts, setRackCounts] = useState<Record<string, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [selectedItem, setSelectedItem] = useState<ProductSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hoveredRack, setHoveredRack] = useState<RackHoverTarget | null>(null);
  const [lockedRack, setLockedRack] = useState<RackHoverTarget | null>(null);
  const [rackPreview, setRackPreview] = useState<RackHoverPreview | null>(null);
  const [rackSearchTerm, setRackSearchTerm] = useState('');
  const [rackPositionFilter, setRackPositionFilter] = useState('all');
  const [viewingRackProduct, setViewingRackProduct] = useState<RackProductGroup | null>(null);
  const [searchRefreshToken, setSearchRefreshToken] = useState(0);
  const [rackRefreshToken, setRackRefreshToken] = useState(0);
  const [rackSyncStatus, setRackSyncStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [lastRackSync, setLastRackSync] = useState<Date | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rackPreviewCache = useRef(new Map<string, {
    cachedAt: number;
    count: number;
    items: RackHoverProduct[];
    rackId?: string;
    binCapacity: number;
  }>());

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    let unsubscribeRacks: () => void = () => undefined;

    const refreshZones = async () => {
      try {
        const [remoteZones, remoteRackCounts] = await Promise.all([
          fetchWarehouseZones(),
          fetchWarehouseRackCounts(),
        ]);
        if (active) {
          setZones(remoteZones);
          setRackCounts(remoteRackCounts);
        }
      } catch {
        if (active) setZones(loadWarehouseZones());
      }
    };

    const frame = window.requestAnimationFrame(() => {
      void refreshZones();
      unsubscribe = subscribeToWarehouseZones(() => void refreshZones());
      unsubscribeRacks = subscribeToWarehouseRacks(() => void refreshZones());
    });

    const syncMap = (event: StorageEvent) => {
      if (event.key === WAREHOUSE_MAP_STORAGE_KEY) setZones(loadWarehouseZones());
    };
    window.addEventListener('storage', syncMap);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      unsubscribe();
      unsubscribeRacks();
      window.removeEventListener('storage', syncMap);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    let cancelled = false;

    const searchProducts = async () => {
      const query = debouncedSearch.replace(/[,()%]/g, ' ').trim();
      if (!query) {
        setResults([]);
        setSelectedItem(null);
        setSearchError('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setSearchError('');
      const response = await supabase
        .from('deposit_items')
        .select('id, item_name, item_code, remaining_quantity, unit, status, storage_location, warehouse_zone_id, deposits(tracking_id, customer_name)')
        .neq('status', 'คืนแล้ว')
        .gt('remaining_quantity', 0)
        .or(`item_name.ilike.%${query}%,item_code.ilike.%${query}%,storage_location.ilike.%${query}%`)
        .order('id', { ascending: false })
        .limit(16);

      // ยังค้นหาได้ระหว่างรอรัน migration ใน Supabase
      let data: unknown = response.data;
      let error = response.error;
      if (error && error.message.includes('warehouse_zone_id')) {
        const legacyResponse = await supabase
          .from('deposit_items')
          .select('id, item_name, item_code, remaining_quantity, unit, status, storage_location, deposits(tracking_id, customer_name)')
          .neq('status', 'คืนแล้ว')
          .gt('remaining_quantity', 0)
          .or(`item_name.ilike.%${query}%,item_code.ilike.%${query}%,storage_location.ilike.%${query}%`)
          .order('id', { ascending: false })
          .limit(16);
        data = legacyResponse.data;
        error = legacyResponse.error;
      }

      if (cancelled) return;
      if (error) {
        setResults([]);
        setSelectedItem(null);
        setSearchError('ค้นหาสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง');
      } else {
        const nextResults = (data ?? []) as unknown as ProductSearchResult[];
        setResults(nextResults);
        setSelectedItem((current) => nextResults.find((item) => item.id === current?.id) ?? nextResults[0] ?? null);
      }
      setLoading(false);
    };

    searchProducts();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, searchRefreshToken]);

  const hoveredZoneId = hoveredRack?.zoneId;
  const hoveredSlotNumber = hoveredRack?.slotNumber;

  useEffect(() => {
    if (!hoveredZoneId || !hoveredSlotNumber) return;

    let cancelled = false;
    const key = `${hoveredZoneId}:${hoveredSlotNumber}`;

    const loadRackProducts = async () => {
      const cached = rackPreviewCache.current.get(key);
      if (cached && Date.now() - cached.cachedAt < 10_000) {
        setRackPreview({
          key,
          loading: false,
          count: cached.count,
          items: cached.items,
          rackId: cached.rackId,
          binCapacity: cached.binCapacity,
        });
        setRackSyncStatus('live');
        return;
      }

      setRackSyncStatus('connecting');
      setRackPreview({ key, loading: true, count: 0, items: [], binCapacity: 4 });
      const racks = await fetchWarehouseRacks(hoveredZoneId);
      const rack = racks.find((candidate) => candidate.rackNumber === hoveredSlotNumber);
      const bins = rack ? await fetchWarehouseBins(rack.id) : [];
      const shelfCapacity = rack ? getRackBins(bins, rack.id).length : 0;

      let query = supabase
        .from('deposit_items')
        .select('id, item_name, item_code, quantity, remaining_quantity, unit, status, detail, item_image_url, storage_location, warehouse_rack_id, warehouse_bin_id, deposits(tracking_id, customer_name, deposit_date, staff_received_name)', { count: 'exact' })
        .eq('warehouse_zone_id', hoveredZoneId)
        .neq('status', 'คืนแล้ว')
        .gt('remaining_quantity', 0);
      query = rack?.id
        ? query.eq('warehouse_rack_id', rack.id)
        : query.ilike('storage_location', `%Rack ${hoveredSlotNumber}%`);
      const response = await query
        .order('item_name', { ascending: true })
        .limit(500);

      if (cancelled) return;
      if (response.error) {
        console.error('Rack preview query failed:', response.error.message);
        setRackSyncStatus('error');
        setRackPreview({
          key,
          loading: false,
          count: 0,
          items: [],
          rackId: rack?.id,
          binCapacity: shelfCapacity || 4,
          error: 'โหลดสินค้าใน Rack ไม่สำเร็จ',
        });
        return;
      }

      const items = (response.data ?? []) as RackHoverProduct[];
      const count = response.count ?? items.length;
      const cachedPreview = {
        cachedAt: Date.now(),
        count,
        items,
        rackId: rack?.id,
        binCapacity: shelfCapacity || 4,
      };
      rackPreviewCache.current.set(key, cachedPreview);
      setRackPreview({ key, loading: false, count, items, rackId: rack?.id, binCapacity: shelfCapacity || 4 });
      setRackSyncStatus('live');
      setLastRackSync(new Date());
    };

    void loadRackProducts().catch((error: unknown) => {
      if (cancelled) return;
      console.error('Rack preview load failed:', error);
      setRackSyncStatus('error');
      setRackPreview({
        key,
        loading: false,
        count: 0,
        items: [],
        binCapacity: 4,
        error: 'โหลดสินค้าใน Rack ไม่สำเร็จ',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [hoveredSlotNumber, hoveredZoneId, rackRefreshToken]);

  useEffect(() => {
    const channel = supabase
      .channel(`warehouse-items-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deposit_items',
        },
        () => {
          rackPreviewCache.current.clear();
          setSearchRefreshToken((current) => current + 1);
          setRackRefreshToken((current) => current + 1);
          setLastRackSync(new Date());
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRackSyncStatus('live');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRackSyncStatus('error');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const matchingZones = useMemo(() => {
    if (!selectedItem) return [];
    if (selectedItem.warehouse_zone_id) {
      return zones.filter((zone) => zone.id === selectedItem.warehouse_zone_id);
    }
    return zones.filter((zone) => zoneMatchesStorageLocation(zone, selectedItem.storage_location));
  }, [selectedItem, zones]);

  const highlightedIds = matchingZones.map((zone) => zone.id);
  const selectedFloor = selectedItem
    ? extractFloorLabel(selectedItem.storage_location) || matchingZones[0]?.floor || ''
    : '';
  const selectedLocationCode = selectedItem
    ? matchingZones[0]?.locationCode || extractLocationCode(selectedItem.storage_location) || ''
    : '';
  const selectedRackNumber = selectedItem
    ? extractRackNumber(selectedItem.storage_location)
    : null;
  const highlightedSlots = selectedRackNumber && matchingZones[0]
    ? { [matchingZones[0].id]: selectedRackNumber }
    : {};
  const isSearching = Boolean(debouncedSearch);
  const locationMapped = Boolean(selectedItem && highlightedIds.length > 0);
  const hoveredZone = hoveredRack
    ? zones.find((zone) => zone.id === hoveredRack.zoneId) ?? null
    : null;
  const activeRackPreview = hoveredRack && rackPreview?.key === `${hoveredRack.zoneId}:${hoveredRack.slotNumber}`
    ? rackPreview
    : null;
  const rackPositionOptions = useMemo(() => {
    const positions = new Map<string, { key: string; shelfLevel: number }>();
    (activeRackPreview?.items ?? []).forEach((item) => {
      const shelfLevel = extractShelfLevel(item.storage_location);
      const key = `L${shelfLevel}`;
      positions.set(key, { key, shelfLevel });
    });
    return Array.from(positions.values())
      .sort((a, b) => a.shelfLevel - b.shelfLevel);
  }, [activeRackPreview?.items]);
  const rackSections = useMemo(
    () => buildRackSections(activeRackPreview?.items ?? [], rackSearchTerm, rackPositionFilter),
    [activeRackPreview?.items, rackPositionFilter, rackSearchTerm],
  );
  const occupiedPositionCount = rackPositionOptions.length;
  const rackBinCapacity = Math.max(activeRackPreview?.binCapacity ?? 4, 1);
  const rackUtilization = Math.min(Math.round((occupiedPositionCount / rackBinCapacity) * 100), 100);
  const rackUtilizationTone = rackUtilization >= 90 ? 'danger' : rackUtilization >= 70 ? 'warning' : 'success';
  const previewHighlightedIds = hoveredRack ? [hoveredRack.zoneId] : highlightedIds;
  const previewHighlightedSlots = hoveredRack
    ? { [hoveredRack.zoneId]: hoveredRack.slotNumber }
    : highlightedSlots;
  const previewDimUnhighlighted = Boolean(hoveredRack || selectedItem);

  const clearSearch = () => {
    setLockedRack(null);
    setHoveredRack(null);
    setRackSearchTerm('');
    setRackPositionFilter('all');
    setViewingRackProduct(null);
    setSearchTerm('');
    setDebouncedSearch('');
    setResults([]);
    setSelectedItem(null);
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (event.key === 'Escape') {
        if (viewingRackProduct) {
          setViewingRackProduct(null);
          return;
        }
        setLockedRack(null);
        setHoveredRack(null);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [viewingRackProduct]);

  return (
    <div className="wh-page wp-page">
      <style>{`
        .wp-page { max-width:1440px; height:calc(100dvh - 60px); padding-top:14px; padding-bottom:14px; display:flex; flex-direction:column; overflow:hidden; }
        .wp-hero { flex:0 0 auto; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:end; gap:8px 16px; margin-bottom:12px; padding:2px 2px 0; color:var(--sp-text); }
        .wp-hero-content { min-width:0; }
        .wp-eyebrow { display:flex; align-items:center; gap:5px; margin-bottom:2px; color:var(--sp-orange-dark); font-size:9.5px; font-weight:800; letter-spacing:.55px; }
        .wp-title { margin:0; color:var(--sp-navy); font-size:22px; line-height:1.2; font-weight:800; letter-spacing:-.45px; }
        .wp-subtitle { display:block; margin:3px 0 0; color:var(--sp-text3); font-size:11.5px; }
        .wp-shortcuts { display:flex; align-items:center; gap:5px; padding-bottom:3px; color:var(--sp-text3); font-size:10.5px; white-space:nowrap; }
        .wp-shortcuts kbd { min-width:24px; padding:3px 6px; border:1px solid var(--sp-border); border-bottom-width:2px; border-radius:6px; background:#fff; color:var(--sp-navy); font:700 9.5px 'Sarabun',sans-serif; text-align:center; }
        .wp-search-wrap { grid-column:1 / -1; position:relative; display:flex; align-items:center; gap:9px; width:100%; background:#fff; border:2px solid var(--sp-blue); border-radius:12px; padding:5px 5px 5px 13px; box-shadow:0 5px 16px rgba(36,91,158,.11); }
        .wp-search-icon { color:var(--sp-blue-md); flex:0 0 auto; }
        .wp-search-input { flex:1; min-width:0; height:36px; border:0; outline:0; color:var(--sp-text); background:transparent; font:600 14px 'Sarabun',sans-serif; }
        .wp-search-input::placeholder { color:#91a4bf; font-weight:500; }
        .wp-search-clear { width:34px; height:34px; border:0; border-radius:8px; background:var(--sp-bg2); color:var(--sp-text3); font-size:18px; cursor:pointer; }
        .wp-search-status { min-width:78px; padding:9px 14px; border-radius:8px; background:linear-gradient(135deg,var(--sp-orange-dark),var(--sp-orange)); color:#fff; font-size:11.5px; font-weight:800; text-align:center; box-shadow:0 3px 9px rgba(159,63,41,.20); }
        .wp-layout { flex:1; min-height:0; display:grid; grid-template-columns:300px minmax(0,1fr); gap:12px; align-items:stretch; }
        .wp-side { min-height:0; display:flex; flex-direction:column; background:var(--sp-white); border:1px solid var(--sp-border); border-radius:14px; overflow:hidden; box-shadow:var(--sp-shadow); }
        .wp-side-head { padding:15px 17px; border-bottom:1px solid var(--sp-border); border-top:4px solid var(--sp-orange); background:linear-gradient(90deg,#fffdf8,#fff8ed); }
        .wp-side-title { margin:0; color:var(--sp-navy); font-size:14px; font-weight:800; }
        .wp-side-sub { margin:3px 0 0; color:var(--sp-text3); font-size:11px; }
        .wp-results { flex:1; min-height:0; padding:8px; overflow:auto; }
        .wp-result { width:100%; margin-bottom:7px; padding:12px; border:1px solid var(--sp-border); border-radius:11px; background:#fff; text-align:left; font-family:inherit; cursor:pointer; transition:var(--sp-transition); }
        .wp-result:hover { border-color:#9abce1; background:#f7faff; transform:translateY(-1px); }
        .wp-result.active { border-color:var(--sp-orange); background:var(--sp-orange-bg); box-shadow:0 0 0 2px rgba(184,75,45,.11); }
        .wp-result-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
        .wp-result-name { color:var(--sp-navy); font-size:13.5px; font-weight:800; line-height:1.35; }
        .wp-result-qty { flex:0 0 auto; padding:3px 8px; border-radius:99px; background:#dcfce7; color:#0e7c3a; font-size:10.5px; font-weight:800; }
        .wp-result-code { margin-top:3px; color:var(--sp-text3); font-size:10.5px; }
        .wp-result-location { display:flex; align-items:center; gap:5px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--sp-border); color:var(--sp-blue); font-size:11.5px; font-weight:700; }
        .wp-empty { display:grid; place-items:center; min-height:190px; padding:24px 18px; text-align:center; color:var(--sp-text3); }
        .wp-empty-icon { width:58px; height:58px; margin:0 auto 12px; display:grid; place-items:center; border-radius:50%; background:#eef4fb; color:var(--sp-blue-md); }
        .wp-empty strong { display:block; margin-bottom:5px; color:var(--sp-text2); font-size:13px; }
        .wp-empty span { font-size:11.5px; line-height:1.6; }
        .wp-map-card { min-width:0; min-height:0; display:flex; flex-direction:column; overflow:hidden; background:var(--sp-white); border:1px solid var(--sp-border); border-radius:14px; box-shadow:var(--sp-shadow); }
        .wp-location-banner { min-height:58px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:1px solid var(--sp-border); border-top:4px solid var(--sp-blue); background:linear-gradient(90deg,#fffdf8,#eef3f9); }
        .wp-location-main { min-width:0; display:flex; align-items:center; gap:12px; }
        .wp-location-pin { width:42px; height:42px; display:grid; place-items:center; flex:0 0 auto; border-radius:12px; color:#fff; background:linear-gradient(135deg,var(--sp-blue),var(--sp-blue-md)); box-shadow:0 4px 12px rgba(30,107,191,.25); }
        .wp-location-pin.found { color:#fff; background:linear-gradient(135deg,var(--sp-orange-dark),var(--sp-orange)); box-shadow:0 4px 12px rgba(159,63,41,.22); }
        .wp-location-title { margin:0; color:var(--sp-navy); font-size:14px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .wp-location-detail { margin:3px 0 0; color:var(--sp-text3); font-size:11.5px; }
        .wp-location-detail strong { color:var(--sp-blue); }
        .wp-location-badges { display:flex; gap:7px; flex-wrap:wrap; justify-content:flex-end; }
        .wp-location-badge { padding:6px 10px; border:1px solid #bdd3ea; border-radius:8px; background:#fff; color:var(--sp-blue); font-size:11px; font-weight:800; white-space:nowrap; }
        .wp-location-badge.floor { border-color:#ead18f; background:#fffaf0; color:#8a5a00; }
        .wp-map-warning { padding:10px 15px; display:flex; align-items:center; justify-content:space-between; gap:10px; background:#fffbeb; border-bottom:1px solid #fde68a; color:#92400e; font-size:11.5px; }
        .wp-map-warning a { color:#7c4b00; font-weight:800; white-space:nowrap; }
        .wp-map-card > .wm-canvas-shell { position:relative; flex:1; min-height:0; background:#fffaf2; }
        .wp-map-card .wm-canvas-scroll { width:100%; height:100%; min-height:0; overflow:auto; }
        .wp-map-loading { flex:1; min-height:300px; display:grid; place-items:center; color:var(--sp-text3); background:#fffaf2; }
        .wm-zoom-controls { position:absolute; right:14px; top:14px; z-index:10; display:flex; gap:6px; }
        .wm-zoom-controls button { min-width:34px; height:34px; padding:0 10px; border:1px solid var(--sp-border); border-radius:8px; background:rgba(255,255,255,.94); color:var(--sp-navy); font:700 14px 'Sarabun',sans-serif; cursor:pointer; box-shadow:0 3px 10px rgba(14,48,96,.12); }
        .wm-zoom-controls button:hover { border-color:var(--sp-blue-md); background:#fff; }
        .wm-zoom-controls .wm-reset-view { font-size:11px; }
        .wp-legend { padding:10px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; border-top:1px solid var(--sp-border); color:var(--sp-text3); font-size:10.5px; }
        .wp-legend-items { display:flex; gap:12px; flex-wrap:wrap; }
        .wp-legend-item { display:flex; align-items:center; gap:5px; }
        .wp-dot { width:9px; height:9px; border-radius:3px; background:var(--sp-blue-md); }
        .wp-dot.highlight { background:var(--sp-orange); box-shadow:0 0 0 2px var(--sp-gold); }
        .wp-dot.dimmed { background:#94a3b8; opacity:.45; }
        .wp-edit-link { display:inline-flex; align-items:center; gap:5px; color:var(--sp-blue); font-weight:800; text-decoration:none; white-space:nowrap; }
        .wp-rack-side-head { background:linear-gradient(135deg,#fff6df,#fff0e8); }
        .wp-rack-side-head .wp-side-title { color:var(--sp-navy); }
        .wp-rack-side-head .wp-side-sub { color:var(--sp-text3); }
        .wp-rack-side-title-row { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .wp-rack-side-unlock { flex:0 0 auto; padding:4px 8px; border:1px solid #efcdbf; border-radius:7px; background:#fff; color:var(--sp-orange-dark); font:700 9.5px 'Sarabun',sans-serif; cursor:pointer; }
        .wp-rack-side-unlock:hover { background:var(--sp-orange-bg); }
        .wp-rack-capacity { margin-top:8px; }
        .wp-rack-capacity-row { display:flex; justify-content:space-between; gap:8px; margin-bottom:4px; color:var(--sp-text2); font-size:9.5px; font-weight:700; }
        .wp-rack-capacity-track { height:5px; overflow:hidden; border-radius:99px; background:#eadfce; }
        .wp-rack-capacity-fill { height:100%; border-radius:inherit; background:#4ade80; transition:width .25s ease; }
        .wp-rack-capacity-fill.warning { background:#fbbf24; }
        .wp-rack-capacity-fill.danger { background:#fb7185; }
        .wp-rack-sync { display:flex; align-items:center; gap:5px; margin-top:6px; color:var(--sp-text3); font-size:9px; }
        .wp-rack-sync-dot { width:6px; height:6px; border-radius:50%; background:#fbbf24; }
        .wp-rack-sync-dot.live { background:#4ade80; box-shadow:0 0 0 2px rgba(74,222,128,.18); }
        .wp-rack-sync-dot.error { background:#fb7185; }
        .wp-rack-tools { position:sticky; top:0; z-index:2; margin:-8px -8px 8px; padding:8px; border-bottom:1px solid #dfe8f2; background:rgba(248,251,255,.97); backdrop-filter:blur(6px); }
        .wp-rack-filter-input { width:100%; height:32px; padding:0 10px; border:1px solid #cbd9e8; border-radius:8px; outline:0; background:#fff; color:var(--sp-text); font:600 11px 'Sarabun',sans-serif; }
        .wp-rack-filter-input:focus { border-color:var(--sp-blue-md); box-shadow:0 0 0 2px rgba(30,107,191,.1); }
        .wp-rack-position-filters { display:flex; gap:4px; margin-top:6px; overflow-x:auto; scrollbar-width:none; }
        .wp-rack-position-filters::-webkit-scrollbar { display:none; }
        .wp-rack-position-filter { flex:0 0 auto; padding:4px 7px; border:1px solid #d4e0ec; border-radius:99px; background:#fff; color:var(--sp-text3); font:700 9px 'Sarabun',sans-serif; cursor:pointer; }
        .wp-rack-position-filter.active { border-color:#78a7d9; background:#eaf3fd; color:var(--sp-blue); }
        .wp-rack-actions { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; margin-top:6px; }
        .wp-rack-action { padding:5px 3px; border:1px solid #cbd9e8; border-radius:7px; background:#fff; color:var(--sp-blue); font-size:8.5px; font-weight:800; text-align:center; text-decoration:none; white-space:nowrap; }
        .wp-rack-action.primary { border-color:#e2a38b; background:var(--sp-orange-bg); color:var(--sp-orange-dark); }
        .wp-rack-section { margin-bottom:7px; overflow:hidden; border:1px solid #d9e4f0; border-radius:10px; background:#f8fbff; }
        .wp-rack-section summary { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; color:var(--sp-navy); font-size:11px; font-weight:800; cursor:pointer; list-style:none; }
        .wp-rack-section summary::-webkit-details-marker { display:none; }
        .wp-rack-section-count { padding:2px 6px; border-radius:99px; background:#e5eef8; color:var(--sp-blue); font-size:8.5px; }
        .wp-rack-section-body { padding:0 6px 6px; }
        .wp-rack-product-card { width:100%; margin-top:5px; padding:9px; border:1px solid #e0e8f1; border-radius:8px; background:#fff; text-align:left; font-family:inherit; cursor:pointer; }
        .wp-rack-product-card:hover { border-color:#8db4dc; box-shadow:0 3px 10px rgba(14,48,96,.08); }
        .wp-rack-product-top { display:flex; align-items:flex-start; justify-content:space-between; gap:7px; }
        .wp-rack-product-name { min-width:0; color:var(--sp-navy); font-size:11.5px; font-weight:800; line-height:1.35; }
        .wp-rack-product-qty { flex:0 0 auto; color:#0e7c3a; font-size:10px; font-weight:800; white-space:nowrap; }
        .wp-rack-product-meta { display:flex; justify-content:space-between; gap:6px; margin-top:4px; color:var(--sp-text3); font-size:9px; }
        .wp-product-drawer-backdrop { position:fixed; inset:0; z-index:500; background:rgba(5,18,38,.38); display:flex; justify-content:flex-end; }
        .wp-product-drawer { width:min(460px,94vw); height:100%; overflow:auto; padding:22px; background:#fff; box-shadow:-12px 0 35px rgba(8,24,48,.24); animation:drawerIn .2s ease; }
        .wp-product-drawer-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding-bottom:14px; border-bottom:1px solid var(--sp-border); }
        .wp-product-drawer-title { margin:0; color:var(--sp-navy); font-size:19px; font-weight:900; line-height:1.35; }
        .wp-product-drawer-code { margin-top:4px; color:var(--sp-text3); font-size:11px; }
        .wp-product-drawer-close { width:34px; height:34px; border:0; border-radius:8px; background:#eef3f8; color:var(--sp-text2); font-size:18px; cursor:pointer; }
        .wp-product-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:14px 0; }
        .wp-product-stat { padding:10px; border:1px solid var(--sp-border); border-radius:10px; background:#f8fbff; }
        .wp-product-stat span { display:block; color:var(--sp-text3); font-size:9.5px; }
        .wp-product-stat strong { display:block; margin-top:3px; color:var(--sp-navy); font-size:14px; }
        .wp-product-lot { margin-top:8px; padding:11px; border:1px solid var(--sp-border); border-radius:10px; }
        .wp-product-lot-top { display:flex; justify-content:space-between; gap:8px; color:var(--sp-navy); font-size:11px; font-weight:800; }
        .wp-product-lot-meta { margin-top:5px; color:var(--sp-text3); font-size:10px; line-height:1.55; }
        .wp-product-drawer-actions { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin-top:16px; }
        .wp-product-drawer-actions a { padding:9px 6px; border-radius:8px; background:#eaf3fd; color:var(--sp-blue); font-size:10px; font-weight:800; text-align:center; text-decoration:none; }
        @keyframes drawerIn { from { transform:translateX(30px); opacity:0; } to { transform:translateX(0); opacity:1; } }
        @media (max-width:1050px) { .wp-page { height:auto; min-height:calc(100dvh - 60px); overflow:visible; } .wp-layout { grid-template-columns:1fr; } .wp-side { min-height:0; } .wp-results { max-height:250px; } .wp-map-card { min-height:560px; } }
        @media (max-width:850px) { .wp-hero { grid-template-columns:1fr auto; } .wp-title { font-size:20px; } }
        @media (max-width:700px) { .wp-hero { grid-template-columns:1fr; gap:7px; } .wp-shortcuts { display:none; } .wp-title { font-size:18px; } .wp-subtitle { font-size:10.5px; } .wp-search-wrap { padding-left:10px; } .wp-search-status { display:none; } .wp-location-banner { align-items:flex-start; flex-direction:column; } .wp-location-badges { justify-content:flex-start; padding-left:54px; } .wp-map-warning { align-items:flex-start; flex-direction:column; } .wp-legend { align-items:flex-start; flex-direction:column; } }
      `}</style>

      <section className="wp-hero">
        <div className="wp-hero-content">
          <div className="wp-eyebrow">
            <Icon size={15}><path d="M3 6.5 8 4l8 3 5-2.5v13L16 20l-8-3-5 2.5z"/><path d="M8 4v13M16 7v13"/></Icon>
            WAREHOUSE LOCATION FINDER
          </div>
          <h1 className="wp-title">ค้นหาสินค้าในคลัง</h1>
          <p className="wp-subtitle">พิมพ์ชื่อสินค้า รหัสสินค้า หรือตำแหน่งจัดเก็บ เพื่อชี้ตำแหน่งบนผังทันที</p>
        </div>

        <div className="wp-shortcuts" aria-label="คีย์ลัดค้นหาด่วน">
          <kbd>Ctrl</kbd><kbd>K</kbd><span>ค้นหาด่วน</span>
        </div>

        <div className="wp-search-wrap">
          <span className="wp-search-icon"><Icon size={21}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon></span>
          <input
            ref={searchInputRef}
            className="wp-search-input"
            value={searchTerm}
            onFocus={() => {
              setLockedRack(null);
              setHoveredRack(null);
              setViewingRackProduct(null);
            }}
            onClick={() => {
              setLockedRack(null);
              setHoveredRack(null);
              setViewingRackProduct(null);
            }}
            onChange={(event) => {
              setLockedRack(null);
              setHoveredRack(null);
              setViewingRackProduct(null);
              setSearchTerm(event.target.value);
            }}
            placeholder="ค้นหาเช่น กล่องพัสดุ, SKU-001, A5..."
            aria-label="ค้นหาสินค้าในคลัง"
            autoFocus
          />
          {searchTerm && <button type="button" className="wp-search-clear" onClick={clearSearch} aria-label="ล้างคำค้น">×</button>}
          <span className="wp-search-status">{loading ? 'กำลังค้น...' : 'ค้นหา'}</span>
        </div>
      </section>

      <div className="wp-layout">
        <aside className="wp-side">
          <div className={`wp-side-head${hoveredRack && hoveredZone ? ' wp-rack-side-head' : ''}`}>
            <div className="wp-rack-side-title-row">
              <h2 className="wp-side-title">
                {hoveredRack && hoveredZone
                  ? `สินค้าในช่อง ${hoveredZone.locationCode} · Rack ${hoveredRack.slotNumber}`
                  : 'ผลการค้นหา'}
              </h2>
              {lockedRack && (
                <button
                  type="button"
                  className="wp-rack-side-unlock"
                  onClick={() => {
                    setLockedRack(null);
                    setHoveredRack(null);
                    setRackSearchTerm('');
                    setRackPositionFilter('all');
                    setViewingRackProduct(null);
                  }}
                >
                  ยกเลิกการเลือก
                </button>
              )}
            </div>
            <p className="wp-side-sub">
              {hoveredRack && hoveredZone
                ? activeRackPreview?.loading
                  ? 'กำลังอ่านข้อมูลจาก Supabase...'
                  : `${activeRackPreview?.count ?? 0} รายการ · ${hoveredZone.name} · ${hoveredZone.floor}${lockedRack ? ' · เลือกแล้ว' : ' · คลิกเพื่อล็อก'}`
                : isSearching
                  ? `พบ ${results.length} รายการที่ยังมีสินค้าคงเหลือ`
                  : 'ระบบจะแสดงเฉพาะสินค้าที่ยังอยู่ในคลัง'}
            </p>
            {hoveredRack && hoveredZone && !activeRackPreview?.loading && (
              <>
                <div className="wp-rack-capacity">
                  <div className="wp-rack-capacity-row">
                    <span>ใช้พื้นที่ {occupiedPositionCount}/{rackBinCapacity} ช่องจัดเก็บ</span>
                    <span>{rackUtilization}%</span>
                  </div>
                  <div className="wp-rack-capacity-track">
                    <div
                      className={`wp-rack-capacity-fill ${rackUtilizationTone}`}
                      style={{ width: `${rackUtilization}%` }}
                    />
                  </div>
                </div>
                <div className="wp-rack-sync">
                  <i className={`wp-rack-sync-dot ${rackSyncStatus}`} />
                  {rackSyncStatus === 'live'
                    ? `Supabase สด${lastRackSync ? ` · ${lastRackSync.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}`
                    : rackSyncStatus === 'error'
                      ? 'การซิงค์ขัดข้อง'
                      : 'กำลังเชื่อมต่อ Supabase'}
                </div>
              </>
            )}
          </div>

          <div className="wp-results">
            {hoveredRack && hoveredZone && (
              <div className="wp-rack-tools">
                <input
                  className="wp-rack-filter-input"
                  value={rackSearchTerm}
                  onChange={(event) => setRackSearchTerm(event.target.value)}
                  placeholder="ค้นหาเฉพาะใน Rack นี้..."
                  aria-label="ค้นหาสินค้าใน Rack ที่เลือก"
                />
                <div className="wp-rack-position-filters">
                  <button
                    type="button"
                    className={`wp-rack-position-filter${rackPositionFilter === 'all' ? ' active' : ''}`}
                    onClick={() => setRackPositionFilter('all')}
                  >
                    ทุกชั้น
                  </button>
                  {rackPositionOptions.map((position) => (
                    <button
                      key={position.key}
                      type="button"
                      className={`wp-rack-position-filter${rackPositionFilter === position.key ? ' active' : ''}`}
                      onClick={() => setRackPositionFilter(position.key)}
                    >
                      ชั้น {position.shelfLevel}
                    </button>
                  ))}
                </div>
                <div className="wp-rack-actions">
                  <Link
                    className="wp-rack-action primary"
                    href={`/main/deposit?open=1&zoneId=${encodeURIComponent(hoveredRack.zoneId)}&zone=${encodeURIComponent(hoveredZone.locationCode)}&rack=${hoveredRack.slotNumber}`}
                  >
                    + รับเข้าช่องนี้
                  </Link>
                  <Link
                    className="wp-rack-action"
                    href={`/main/inventory?q=${encodeURIComponent(`Rack ${hoveredRack.slotNumber}`)}&zoneId=${encodeURIComponent(hoveredRack.zoneId)}&rack=${hoveredRack.slotNumber}${activeRackPreview?.rackId ? `&rackId=${encodeURIComponent(activeRackPreview.rackId)}` : ''}`}
                  >
                    ย้ายสินค้า
                  </Link>
                  <Link
                    className="wp-rack-action"
                    href={`/main/withdraw?q=${encodeURIComponent(`Rack ${hoveredRack.slotNumber}`)}`}
                  >
                    เบิก/คืน
                  </Link>
                </div>
              </div>
            )}
            {hoveredRack && hoveredZone ? (
              activeRackPreview?.loading || !activeRackPreview ? (
                <div className="wp-empty"><div><div className="wp-empty-icon"><Icon><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon></div><strong>กำลังโหลดสินค้าใน Rack</strong><span>กำลังอ่านข้อมูลล่าสุดจาก Supabase</span></div></div>
              ) : activeRackPreview.error ? (
                <div className="wp-empty"><div><div className="wp-empty-icon"><Icon><path d="M12 9v4m0 4h.01"/><path d="M10 3h4l8 16H2z"/></Icon></div><strong>{activeRackPreview.error}</strong></div></div>
              ) : activeRackPreview.items.length === 0 ? (
                <div className="wp-empty"><div><div className="wp-empty-icon"><Icon><path d="M3 7h18v13H3zM7 7V4h10v3"/><path d="M9 12h6"/></Icon></div><strong>ยังไม่มีสินค้าใน Rack นี้</strong><span>ช่องนี้พร้อมสำหรับจัดเก็บสินค้า</span></div></div>
              ) : rackSections.length === 0 ? (
                <div className="wp-empty"><div><div className="wp-empty-icon"><Icon size={22}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon></div><strong>ไม่พบสินค้าในตัวกรองนี้</strong><span>ลองเปลี่ยนคำค้นหาหรือชั้น</span></div></div>
              ) : (
                rackSections.map((section) => (
                  <details className="wp-rack-section" key={section.key} open>
                    <summary>
                      <span>ชั้น {section.shelfLevel || '—'}</span>
                      <span className="wp-rack-section-count">{section.products.length} SKU</span>
                    </summary>
                    <div className="wp-rack-section-body">
                      {section.products.map((product) => (
                        <button
                          key={product.key}
                          type="button"
                          className="wp-rack-product-card"
                          onClick={() => setViewingRackProduct(product)}
                        >
                          <span className="wp-rack-product-top">
                            <span className="wp-rack-product-name">{product.itemName}</span>
                            <span className="wp-rack-product-qty">{product.totalRemaining} {product.unit}</span>
                          </span>
                          <span className="wp-rack-product-meta">
                            <span>{product.itemCode || 'ไม่มีรหัส'}</span>
                            <span>{product.lots.length} ล็อต</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </details>
                ))
              )
            ) : loading ? (
              <div className="wp-empty"><div><div className="wp-empty-icon"><Icon><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon></div><strong>กำลังค้นหาสินค้า</strong></div></div>
            ) : searchError ? (
              <div className="wp-empty"><div><div className="wp-empty-icon"><Icon><path d="M12 9v4m0 4h.01"/><path d="M10 3h4l8 16H2z"/></Icon></div><strong>{searchError}</strong></div></div>
            ) : !isSearching ? (
              <div className="wp-empty"><div><div className="wp-empty-icon"><Icon size={25}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon></div><strong>เริ่มค้นหาด้านบน</strong><span>เมื่อเลือกสินค้า ผังจะเน้นจุดจัดเก็บและลดสีพื้นที่อื่น</span></div></div>
            ) : results.length === 0 ? (
              <div className="wp-empty"><div><div className="wp-empty-icon"><Icon><path d="M3 7h18v13H3zM7 7V4h10v3"/><path d="M9 12h6"/></Icon></div><strong>ไม่พบสินค้าที่ยังคงเหลือ</strong><span>ลองค้นหาด้วยชื่อ รหัส หรือตำแหน่งอื่น</span></div></div>
            ) : (
              results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`wp-result${selectedItem?.id === item.id ? ' active' : ''}`}
                  onClick={() => {
                    setLockedRack(null);
                    setHoveredRack(null);
                    setViewingRackProduct(null);
                    setSelectedItem(item);
                  }}
                >
                  <span className="wp-result-top">
                    <span className="wp-result-name">{item.item_name}</span>
                    <span className="wp-result-qty">{item.remaining_quantity} {item.unit || ''}</span>
                  </span>
                  <span className="wp-result-code">{item.item_code ? `รหัส ${item.item_code}` : 'ไม่มีรหัสสินค้า'}{item.deposits?.tracking_id ? ` · ${item.deposits.tracking_id}` : ''}</span>
                  <span className="wp-result-location"><Icon size={14}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></Icon>{displayStorageLocation(item.storage_location) || 'ยังไม่ระบุตำแหน่ง'}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="wp-map-card">
          <div className="wp-location-banner">
            <div className="wp-location-main">
              <div className={`wp-location-pin${locationMapped ? ' found' : ''}`}>
                <Icon size={22}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></Icon>
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 className="wp-location-title">
                  {selectedItem ? selectedItem.item_name : 'ภาพรวมผังคลังสินค้า'}
                </h2>
                <p className="wp-location-detail">
                  {selectedItem
                    ? <>จัดเก็บที่ <strong>{displayStorageLocation(selectedItem.storage_location) || 'ยังไม่ระบุตำแหน่ง'}</strong></>
                    : 'ค้นหาสินค้าเพื่อเน้นตำแหน่งบนผัง'}
                </p>
              </div>
            </div>

            {selectedItem && (
              <div className="wp-location-badges">
                {selectedLocationCode && <span className="wp-location-badge">ตำแหน่ง {selectedLocationCode}</span>}
                {selectedFloor && <span className="wp-location-badge floor">{selectedFloor}</span>}
                {selectedRackNumber && <span className="wp-location-badge">Rack {selectedRackNumber}</span>}
              </div>
            )}
          </div>

          {selectedItem && !locationMapped && (
            <div className="wp-map-warning">
              <span>⚠️ พบพิกัดสินค้าแล้ว แต่ยังไม่มีโซนในผังที่ตรงกับ “{displayStorageLocation(selectedItem.storage_location) || 'ไม่ระบุ'}”</span>
              <Link href="/main/warehouse-map">ไปผูกรหัสตำแหน่ง →</Link>
            </div>
          )}

          <WarehouseMapCanvas
            zones={zones}
            selectedIds={[]}
            slotCounts={rackCounts}
            highlightedIds={previewHighlightedIds}
            highlightedSlots={previewHighlightedSlots}
            dimUnhighlighted={previewDimUnhighlighted}
            readOnly
            onSelectIds={() => undefined}
            onDragEnd={() => undefined}
            onBulkDragEnd={() => undefined}
            onResize={() => undefined}
            onEdit={() => undefined}
            onSlotHover={(slot) => {
              if (lockedRack) return;
              if (!slot) {
                setHoveredRack(null);
                return;
              }

              const nextHoveredRack = {
                zoneId: slot.zoneId,
                slotNumber: slot.slotNumber,
              };
              if (hoveredRack?.zoneId !== slot.zoneId || hoveredRack.slotNumber !== slot.slotNumber) {
                setRackSearchTerm('');
                setRackPositionFilter('all');
                setViewingRackProduct(null);
              }
              setHoveredRack(nextHoveredRack);
            }}
            onSlotClick={(slot) => {
              const nextLockedRack = {
                zoneId: slot.zoneId,
                slotNumber: slot.slotNumber,
              };
              if (hoveredRack?.zoneId !== slot.zoneId || hoveredRack.slotNumber !== slot.slotNumber) {
                setRackSearchTerm('');
                setRackPositionFilter('all');
                setViewingRackProduct(null);
              }
              setLockedRack(nextLockedRack);
              setHoveredRack(nextLockedRack);
            }}
          />

          <div className="wp-legend">
            <div className="wp-legend-items">
              {hoveredRack ? (
                <>
                  <span className="wp-legend-item"><i className="wp-dot highlight" />Rack ที่กำลังดู</span>
                  <span className="wp-legend-item"><i className="wp-dot dimmed" />พื้นที่อื่น</span>
                  <span className="wp-legend-item">ชี้เพื่อดู · คลิกเพื่อล็อก · Esc เพื่อยกเลิก</span>
                </>
              ) : selectedItem ? (
                <>
                  <span className="wp-legend-item"><i className="wp-dot highlight" />ตำแหน่งสินค้าที่เลือก</span>
                  <span className="wp-legend-item"><i className="wp-dot dimmed" />พื้นที่อื่น</span>
                </>
              ) : (
                <span className="wp-legend-item"><i className="wp-dot" />สีประจำโซน</span>
              )}
            </div>
            <Link href="/main/warehouse-map" className="wp-edit-link"><Icon size={14}><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/></Icon>แก้ไขผังคลัง</Link>
          </div>
        </section>
      </div>

      {viewingRackProduct && hoveredRack && hoveredZone && (
        <div
          className="wp-product-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setViewingRackProduct(null);
          }}
        >
          <aside className="wp-product-drawer" role="dialog" aria-modal="true" aria-labelledby="wp-product-drawer-title">
            <div className="wp-product-drawer-head">
              <div>
                <h2 className="wp-product-drawer-title" id="wp-product-drawer-title">{viewingRackProduct.itemName}</h2>
                <div className="wp-product-drawer-code">
                  {viewingRackProduct.itemCode || 'ไม่มีรหัสสินค้า'} · ช่อง {hoveredZone.locationCode} · Rack {hoveredRack.slotNumber}
                </div>
              </div>
              <button type="button" className="wp-product-drawer-close" onClick={() => setViewingRackProduct(null)} aria-label="ปิดรายละเอียด">×</button>
            </div>

            {viewingRackProduct.lots[0]?.item_image_url && (
              <img
                src={viewingRackProduct.lots[0].item_image_url ?? ''}
                alt={viewingRackProduct.itemName}
                style={{ width: '100%', maxHeight: 190, objectFit: 'cover', borderRadius: 12, marginTop: 14 }}
              />
            )}

            <div className="wp-product-stats">
              <div className="wp-product-stat"><span>คงเหลือรวม</span><strong>{viewingRackProduct.totalRemaining} {viewingRackProduct.unit}</strong></div>
              <div className="wp-product-stat"><span>จำนวนรับเข้า</span><strong>{viewingRackProduct.totalQuantity}</strong></div>
              <div className="wp-product-stat"><span>จำนวนล็อต</span><strong>{viewingRackProduct.lots.length}</strong></div>
            </div>

            <div style={{ color: 'var(--sp-navy)', fontSize: 12, fontWeight: 900 }}>
              ชั้น {viewingRackProduct.shelfLevel || '—'}
            </div>
            {viewingRackProduct.lots.map((lot) => (
              <div className="wp-product-lot" key={lot.id}>
                <div className="wp-product-lot-top">
                  <span>{lot.deposits?.tracking_id || `รายการ #${lot.id}`}</span>
                  <span>{lot.remaining_quantity} {lot.unit || ''}</span>
                </div>
                <div className="wp-product-lot-meta">
                  ผู้ฝาก: {lot.deposits?.customer_name || 'ไม่ระบุ'}<br />
                  วันที่รับเข้า: {lot.deposits?.deposit_date ? new Date(lot.deposits.deposit_date).toLocaleDateString('th-TH') : 'ไม่ระบุ'}<br />
                  พนักงาน: {lot.deposits?.staff_received_name || 'ไม่ระบุ'}
                  {displayItemDetail(lot.detail) ? <><br />รายละเอียด: {displayItemDetail(lot.detail)}</> : null}
                </div>
              </div>
            ))}

            <div className="wp-product-drawer-actions">
              <Link href={`/main/deposit?open=1&zoneId=${encodeURIComponent(hoveredRack.zoneId)}&zone=${encodeURIComponent(hoveredZone.locationCode)}&rack=${hoveredRack.slotNumber}`}>รับเพิ่ม</Link>
              <Link href={`/main/inventory?q=${encodeURIComponent(viewingRackProduct.itemCode || viewingRackProduct.itemName)}`}>ย้าย/แก้ไข</Link>
              <Link href={`/main/withdraw?q=${encodeURIComponent(viewingRackProduct.itemCode || viewingRackProduct.itemName)}`}>เบิก/คืน</Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
