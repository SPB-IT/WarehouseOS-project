# WarehouseOS — สำเพ็งบุรีรัมย์

ระบบค้นหาตำแหน่งสินค้า รับฝาก คืนสินค้า ดูประวัติ และจัดผังคลังแบบเชื่อมกับ Supabase

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

เปิด <http://localhost:3000> คำเตือน workspace root จากหลาย `package-lock.json` ถูกแก้ด้วย `turbopack.root` ใน `next.config.ts` แล้ว

## Environment variables

คัดลอกค่าจาก `.env.example` ไป `.env.local` แล้วใส่ Supabase URL และ anon key ของโปรเจกต์ ห้าม commit `.env.local`

## ฐานข้อมูลและระบบล็อกอิน

Migration ล่าสุดคือ `supabase/migrations/20260821_security_transactions_and_demo_data.sql` ซึ่งเพิ่ม:

- Email/Password authentication และสิทธิ์ `admin` / `staff`
- Row Level Security สำหรับข้อมูลคลังและผัง
- transaction สำหรับรับฝากและคืนสินค้าหลายรายการ
- ตัวระบุข้อมูลตัวอย่างและ archived zones
- validation จำนวนสินค้าและการซิงก์พิกัด `โซน → Rack → ชั้น`

ก่อนรัน migration ต้องสร้างผู้ใช้ใน Supabase Auth อย่างน้อยหนึ่งคน แล้วทำตาม `SECURITY_SETUP.md`

## ตรวจคุณภาพก่อนอัป Git

```bash
npm run check
```

คำสั่งนี้รัน lint, TypeScript, automated tests และ production build ตามลำดับ

ตรวจความสัมพันธ์พิกัดกับ Supabase แบบอ่านอย่างเดียว:

```bash
node --env-file=.env.local scripts/audit-placement-sync.mjs
```
