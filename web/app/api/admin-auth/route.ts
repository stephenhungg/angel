import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

/**
 * POST /api/admin-auth
 *   body: { password }
 *   sets `angel_admin` cookie on match.
 *
 * POST /api/admin-auth?logout=1
 *   clears the cookie.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();

  if (url.searchParams.get('logout') === '1') {
    jar.delete('angel_admin');
    // 303 forces the redirect target to GET (POST → GET), correct for form-post logout.
    return NextResponse.redirect(new URL('/admin', req.url), 303);
  }

  const expected = process.env.ADMIN_PASSWORD ?? 'angel';

  let password = '';
  try {
    const body = (await req.json()) as { password?: string };
    password = body.password ?? '';
  } catch {
    // ignore — empty password will fail below
  }

  if (password !== expected) {
    return new NextResponse('forbidden', { status: 403 });
  }

  jar.set('angel_admin', expected, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h
    secure: process.env.NODE_ENV === 'production',
  });

  return NextResponse.json({ ok: true });
}
