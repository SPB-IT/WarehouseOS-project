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

## NAS backups

Daily at 20:00 Asia/Bangkok from the main Windows PC, while signed in and connected to the NAS. Destination: `Y:\BackUp_WareHouse\Sampeng` (configured using UNC in backup.config.json). Run `npm run backup:install` on the main PC to install/update the task. The task retries three times at 15-minute intervals. Seven latest daily files are retained separately per project. Existing local backups are not moved or deleted.

Manual run: `npm run backup:local`. Local task logs: `.backup-logs/latest.log`; verified result: `.backup-logs/status.json`. The website shows the configured destination, not the task's live status. Browser snapshots and download buttons still work independently.
