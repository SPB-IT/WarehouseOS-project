import type { Metadata } from 'next';
import Navbar from './components/Navbar';

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
      <body style={{ margin: 0, background: '#f8fafc', fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", minHeight: '100vh' }}>
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  );
}