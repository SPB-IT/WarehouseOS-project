import { redirect } from 'next/navigation';
export default function Home() {
  redirect('/main'); // บังคับให้เข้า /main ตลอดเวลา
}