import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/attrezzature/upload" });
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const bucket = process.env.ATTREZZATURE_BUCKET || "attrezzature";
    const key = process.env.ATTREZZATURE_MASTER_KEY || "master.xlsx";

    const buf = Buffer.from(await req.arrayBuffer());

    const sb = createClient(supabaseUrl, serviceKey);
    // assicuro il bucket
    await sb.storage.createBucket(bucket, { public: false }).catch(() => { /* esiste già */ });

const { data, error } = await sb.storage.from(bucket).upload(key, buf, {
  upsert: true,
  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
if (error) {
  return NextResponse.json({ ok:false, stage:"upload", error: error.message }, { status: 500 });
}

// verifica presenza
const { data: listed, error: listErr } = await sb.storage.from(bucket).list("", { search: key });
if (listErr) {
  return NextResponse.json({ ok:false, stage:"list", error: listErr.message }, { status: 500 });
}
const found = (listed || []).some(o => o.name === key);
if (!found) {
  return NextResponse.json({ ok:false, stage:"verify", error: `Oggetto non trovato dopo upload: ${key}` }, { status: 500 });
}

return NextResponse.json({ ok: true, bucket, key });

  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
