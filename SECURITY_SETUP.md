# เปิดระบบล็อกอินและสิทธิ์ WarehouseOS

ทำตามลำดับนี้เพื่อไม่ให้หน้าเว็บถูกล็อกก่อนมีบัญชีผู้ดูแล

1. ไปที่ Supabase > Authentication > Users แล้วสร้างผู้ใช้ Email/Password อย่างน้อย 1 คน
2. เปิด SQL Editor แล้วรัน `supabase/migrations/20260821_security_transactions_and_demo_data.sql` ทั้งไฟล์ ผู้ใช้คนแรกจะได้สิทธิ์ `admin` และคนถัดไปเป็น `staff`
3. ตั้ง `NEXT_PUBLIC_REQUIRE_AUTH=true` ใน `.env.local` และใน Environment Variables ของระบบที่ deploy
4. รีสตาร์ต `npm run dev` หรือ deploy ใหม่ แล้วเข้าสู่ระบบที่ `/login`

หากต้องเปลี่ยนสิทธิ์ผู้ใช้ ให้ผู้ดูแลรันคำสั่งนี้ใน SQL Editor โดยแทนค่าอีเมล:

```sql
update public.warehouse_user_roles role_row
set role = 'admin', updated_at = now()
from auth.users account
where role_row.user_id = account.id
  and account.email = 'staff@example.com';
```

ข้อมูลรหัส `MOCK-*` จะถูกทำเครื่องหมายเป็นข้อมูลตัวอย่าง ไม่ถูกลบ และกรองได้ในหน้ารายการคลัง ส่วนโซนรุ่นเก่าที่ไม่มีสินค้าจะถูกเก็บแบบ archived ไม่แสดงบนผังหลัก
