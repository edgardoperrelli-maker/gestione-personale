import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const target = String(form.get('target') || '')
    const path = String(form.get('path') || '')
    const filename = String(form.get('filename') || '')

    if (!file || !filename) {
      return NextResponse.json({ error: 'file/filename mancanti' }, { status: 400 })
    }

    if (target === 'supabase') {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side
      if (!url || !key) return NextResponse.json({ error: 'Env Supabase mancanti' }, { status: 500 })

      const sb = createClient(url, key, { auth: { persistSession: false } })
      const bucket = process.env.RAPPORTINI_BUCKET || 'rapportini'
      const objectPath = [path, filename].filter(Boolean).join('/')

      const arrBuf = Buffer.from(await file.arrayBuffer())
      const { error } = await sb.storage.from(bucket).upload(objectPath, arrBuf, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })

      const { data: pub } = sb.storage.from(bucket).getPublicUrl(objectPath)
      return NextResponse.json({ ok: true, bucket, path: objectPath, publicUrl: pub.publicUrl })
    }

    if (target === 'sharepoint') {
      // TODO: integrare Microsoft Graph (client credentials o on-behalf-of)
      // Richiede: TENANT_ID, CLIENT_ID, CLIENT_SECRET, SITE_ID, DRIVE_ID e permessi Files.ReadWrite.All
      return NextResponse.json({ error: 'SharePoint non configurato' }, { status: 501 })
    }

    return NextResponse.json({ error: 'Target non supportato' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Errore inatteso' }, { status: 500 })
  }
}
