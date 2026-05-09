import { cookies } from 'next/headers';
import { AdminGate } from './_components/AdminGate';
import { AdminChrome } from './_components/AdminChrome';

/**
 * /admin layout — server component.
 *
 * password gate via env `ADMIN_PASSWORD`. once submitted on the client, we
 * set a signed-ish session cookie (`angel_admin`) whose value is the env
 * password itself — fine for a hackathon demo, do NOT use in production.
 *
 * the chrome (left rail with Space / Traces / Synthesis) wraps every child
 * route. aesthetic = paper warmth, hairline dividers, instrument-serif italic
 * for headers. matches the moment.framer.photos reference.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const expected = process.env.ADMIN_PASSWORD ?? 'angel';
  const provided = (await cookies()).get('angel_admin')?.value;
  const authed = !!provided && provided === expected;

  if (!authed) {
    return <AdminGate />;
  }

  return <AdminChrome>{children}</AdminChrome>;
}

export const metadata = {
  title: 'angel — observatory',
  description: 'live trait-space, traces, and synthesis log.',
  robots: { index: false, follow: false },
};
