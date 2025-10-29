import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Invia email di richiesta prenotazione hotel.
 * L’email parte dall’account configurato in ENV e mette sempre in CC Christian.arragoni@plenzich.it
 */
export async function POST(req: NextRequest) {
  try {
    const { to, periodStart, periodEnd, roomTypes, note } = await req.json();

    if (!to || !Array.isArray(to) || to.length === 0)
      return NextResponse.json({ error: 'Destinatari mancanti' }, { status: 400 });

    // Imposta trasporto SMTP (legge da variabili ambiente)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  requireTLS: true,
  auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
});


    const fromEmail = process.env.SMTP_USER;
    const ccFixed = 'Christian.arragoni@plenzich.it';;

    const subject = `Richiesta disponibilità camere (${periodStart} → ${periodEnd})`;
    const body = `
Gentile Hotel,

si richiede disponibilità per il seguente periodo:

Periodo: ${periodStart} → ${periodEnd}
Tipologie camere: ${roomTypes}
Note: ${note || 'Nessuna nota'}

Cordiali saluti,
Plenzich S.p.A.
`;
await transporter.verify();

await transporter.sendMail({
  from: `"Plenzich – Prenotazioni (no-reply)" <${fromEmail}>`,
  to,
  cc: ccFixed,
  replyTo: 'edgardo.perrelli@plenzich.it',
  subject,
  text: body,
  html: `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.5">
      <p>Gentile Hotel,</p>
      <p>si richiede disponibilità per il seguente periodo:</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 8px;border:1px solid #ddd">Periodo</td><td style="padding:4px 8px;border:1px solid #ddd"><b>${periodStart}</b> → <b>${periodEnd}</b></td></tr>
        <tr><td style="padding:4px 8px;border:1px solid #ddd">Tipologie camere</td><td style="padding:4px 8px;border:1px solid #ddd">${roomTypes}</td></tr>
        ${note ? `<tr><td style="padding:4px 8px;border:1px solid #ddd">Note</td><td style="padding:4px 8px;border:1px solid #ddd">${note}</td></tr>` : ''}
      </table>
      <p style="margin-top:12px">Cordiali saluti,<br/>Plenzich S.p.A.</p>
    </div>
  `,
});



    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Errore invio email' }, { status: 500 });
  }
}
