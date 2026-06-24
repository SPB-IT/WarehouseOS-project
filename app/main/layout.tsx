import type { Metadata } from 'next';
import Navbar from './components/Navbar';

export const metadata: Metadata = {
  title: 'WarehouseOS — ระบบจัดการคลังสินค้า',
  description: 'ระบบรับฝาก คืน และติดตามสินค้าคลัง',
};

// ✅ Nested layout ต้องไม่มี <html> หรือ <body>
// root layout (app/layout.tsx) จัดการ html/body/fonts แล้ว
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
    </>
  );
}
