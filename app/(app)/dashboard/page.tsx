import { redirect } from 'next/navigation';

/** Old home. The signed-in home is now the Studio. */
export default function DashboardRedirect() {
  redirect('/studio');
}
