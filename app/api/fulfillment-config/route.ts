import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return new NextResponse('window.APP_CONFIG = { ERROR: true };', {
      status: 503,
      headers: { 'content-type': 'application/javascript; charset=utf-8' },
    })
  }

  const payload = `window.APP_CONFIG = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_KEY: key })};`
  return new NextResponse(payload, {
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/javascript; charset=utf-8',
    },
  })
}
