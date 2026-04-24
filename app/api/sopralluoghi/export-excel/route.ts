import { NextRequest, NextResponse } from 'next/server';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { firstRelation } from '../_helpers';

export const dynamic = 'force-dynamic';

type ExportFilters = {
  territorio_id?: string | null;
  activity_id?: string | null;
  microarea?: string | null;
  solo_idonei?: boolean;
  stato?: 'visitato' | 'programmato' | null;
};

type ExportSopralluogoRow = {
  id: number;
  stato: 'da_visitare' | 'visitato' | 'programmato';
  idoneo_risanamento: boolean | null;
  punti_gas: number | null;
  note: string | null;
  data_sopralluogo: string | null;
  territorio_id: string | null;
};

type ExportCivicoRow = {
  microarea: string;
  odonimo: string;
  civico: string;
  latitudine: number | null;
  longitudine: number | null;
  territorio_id: string | null;
  activity_id: string | null;
  sopralluoghi: ExportSopralluogoRow | ExportSopralluogoRow[] | null;
};

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
    const supabase = createServerComponentClient({ cookies: cookieMethods });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
    }

    const filters = (await request.json()) as ExportFilters;

    let query = supabase
      .from('civici_napoli')
      .select(`
        *,
        sopralluoghi!inner(
          id,
          stato,
          idoneo_risanamento,
          punti_gas,
          note,
          data_sopralluogo,
          territorio_id
        )
      `);

    if (filters.territorio_id) {
      query = query.eq('territorio_id', filters.territorio_id);
      query = query.eq('sopralluoghi.territorio_id', filters.territorio_id);
    }

    if (filters.activity_id) {
      query = query.eq('activity_id', filters.activity_id);
    }

    if (filters.microarea) {
      query = query.eq('microarea', filters.microarea);
    }

    if (filters.solo_idonei) {
      query = query.eq('sopralluoghi.idoneo_risanamento', true);
    }

    if (filters.stato) {
      query = query.eq('sopralluoghi.stato', filters.stato);
    }

    const { data: civici, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!civici || civici.length === 0) {
      return NextResponse.json(
        { error: 'Nessun civico trovato con i filtri applicati' },
        { status: 404 },
      );
    }

    const exportRows = civici as ExportCivicoRow[];
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GestiLab Cantieri';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Civici Programmati');
    worksheet.columns = [
      { header: 'Microarea', key: 'microarea', width: 18 },
      { header: 'Indirizzo', key: 'odonimo', width: 40 },
      { header: 'Civico', key: 'civico', width: 12 },
      { header: 'Latitudine', key: 'latitudine', width: 12 },
      { header: 'Longitudine', key: 'longitudine', width: 12 },
      { header: 'Stato', key: 'stato', width: 14 },
      { header: 'Idoneo', key: 'idoneo', width: 10 },
      { header: 'PG', key: 'punti_gas', width: 10 },
      { header: 'Data Sopralluogo', key: 'data_sopralluogo', width: 16 },
      { header: 'Note', key: 'note', width: 30 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF921B1B' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    exportRows.forEach((civico) => {
      const sopralluogo = firstRelation(civico.sopralluoghi);

      worksheet.addRow({
        microarea: civico.microarea,
        odonimo: civico.odonimo,
        civico: civico.civico,
        latitudine: civico.latitudine,
        longitudine: civico.longitudine,
        stato: sopralluogo?.stato ?? '',
        idoneo: sopralluogo?.idoneo_risanamento ? 'SI' : 'NO',
        punti_gas: sopralluogo?.punti_gas ?? '',
        data_sopralluogo: sopralluogo?.data_sopralluogo
          ? new Date(sopralluogo.data_sopralluogo).toLocaleDateString('it-IT')
          : '',
        note: sopralluogo?.note ?? '',
      });
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cell = row.getCell('idoneo');
      if (cell.value === 'SI') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } };
        cell.font = { color: { argb: 'FF155724' }, bold: true };
      }
    });

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const statsRow = worksheet.addRow([]);
    statsRow.getCell(1).value = 'TOTALE:';
    statsRow.getCell(1).font = { bold: true };
    statsRow.getCell(2).value = `${exportRows.length} civici`;

    const idoneiCount = exportRows.filter((civico) => firstRelation(civico.sopralluoghi)?.idoneo_risanamento).length;
    const puntiGasTotali = exportRows.reduce(
      (sum, civico) => sum + (firstRelation(civico.sopralluoghi)?.punti_gas ?? 0),
      0,
    );
    statsRow.getCell(7).value = `${idoneiCount} idonei`;
    statsRow.getCell(7).font = { bold: true, color: { argb: 'FF155724' } };
    statsRow.getCell(8).value = `${puntiGasTotali} PG`;
    statsRow.getCell(8).font = { bold: true, color: { argb: 'FF921B1B' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `Civici_Programmati_${timestamp}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Errore export Excel:', message);
    return NextResponse.json(
      { error: 'Errore durante la generazione del file Excel', details: message },
      { status: 500 },
    );
  }
}
