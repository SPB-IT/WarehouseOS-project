// types/warehouse.ts — shared types สำหรับทั้งโปรเจกต์

export interface Deposit {
  id: number;
  tracking_id: string;
  customer_name: string;
  customer_phone?: string;
  deposit_date?: string;
  staff_received_name?: string;
  created_at?: string;
  deposit_items?: DepositItem[];
}

export interface DepositItem {
  id: number;
  deposit_id: number;
  item_name: string;
  item_code?: string;
  quantity: number;
  remaining_quantity: number;
  unit: string;
  status: 'กำลังฝาก' | 'คืนแล้ว';
  storage_location?: string;
  detail?: string;
  item_image_url?: string;
  created_at?: string;
  deposits?: Deposit;
}

export interface Withdrawal {
  id: number;
  deposit_item_id: number;
  withdraw_quantity: number;
  withdraw_date?: string;
  staff_signature_name?: string;
  remark?: string;
  status?: string;
  created_at?: string;
  deposit_items?: DepositItem & { deposits?: Deposit };
}

export interface DashboardStats {
  totalDeposits: number;
  totalItems: number;
  totalRemaining: number;
  activeItems: number;
  returnedItems: number;
  totalWithdrawals: number;
}