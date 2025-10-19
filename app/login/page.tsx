import { redirect } from 'next/navigation';

export default function Page({
  searchParams,
}: { searchParams: { [k: string]: string | string[] | undefined } }) {
  const r = typeof searchParams?.redirect === 'string' ? searchParams.redirect : '/dashboard';
  redirect(`/auth/sign-in?redirect=${encodeURIComponent(r)}`);
}
