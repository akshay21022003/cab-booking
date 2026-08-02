import { redirect } from 'next/navigation';
import { validateSession } from '@/lib/auth';

export default async function Home() {
  const user = await validateSession();

  if (!user) {
    redirect('/login');
  }

  // Redirect based on highest role
  switch (user.highestRole) {
    case 'SUPER_ADMIN':
      redirect('/dashboard/super-admin');
    case 'DEPARTMENT_ADMIN':
      redirect('/dashboard/admin');
    default:
      redirect('/dashboard/user');
  }
}
