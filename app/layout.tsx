// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WarehouseOS — ระบบจัดการคลังสินค้า',
  description: 'ระบบรับฝาก คืน และติดตามสินค้าคลัง',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* ตรงนี้ไม่มี Navbar เพราะจะให้หน้าปริ้นท์ที่อยู่ข้างนอกใช้ไฟล์นี้ด้วย */}
      <body style={{ margin: 0, background: '#f8fafc', fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", minHeight: '100vh' }}>
        <main>{children}</main>
      </body>
    </html>
  );
}