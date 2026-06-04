import { NextResponse } from 'next/server'

// Debug endpoint — completely disabled
// Use Vercel dashboard or .env.local to check env vars
export async function GET() {
  return NextResponse.json({ error: 'Not available' }, { status: 404 })
}
