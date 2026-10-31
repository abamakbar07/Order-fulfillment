import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET() {
  const supabase = adminClient()
  const { data, error } = await supabase.from('warehouse_members').select('id, login_id, full_name, created_at').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Unable to load warehouse users.' }, { status: 500 })
  return NextResponse.json({ users: data })
}

export async function POST(request: Request) {
  const body = await request.json() as { loginId?: string; fullName?: string; password?: string }
  const loginId = body.loginId?.trim().toLowerCase()
  const fullName = body.fullName?.trim()
  const password = body.password
  if (!loginId || !/^[a-z0-9._-]{3,40}$/.test(loginId) || !fullName || !password || password.length < 8) return NextResponse.json({ error: 'Enter a valid user ID, name, and password of at least 8 characters.' }, { status: 400 })
  const supabase = adminClient()
  const internalEmail = `${loginId}@rf.northstar.internal`
  const { data: created, error: authError } = await supabase.auth.admin.createUser({ email: internalEmail, password, email_confirm: true, user_metadata: { full_name: fullName } })
  if (authError || !created.user) return NextResponse.json({ error: authError?.message === 'User already registered' ? 'That user ID is already in use.' : 'Unable to create warehouse user.' }, { status: 400 })
  const { error: profileError } = await supabase.from('warehouse_members').upsert({ id: created.user.id, login_id: loginId, full_name: fullName }, { onConflict: 'id' })
  if (profileError) { await supabase.auth.admin.deleteUser(created.user.id); return NextResponse.json({ error: 'Unable to save warehouse user.' }, { status: 500 }) }
  return NextResponse.json({ user: { id: created.user.id, login_id: loginId, full_name: fullName } }, { status: 201 })
}
