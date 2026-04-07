import { mergeDocx } from '@benedicte/docx-merge';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { documents } = await request.json();

    if (!Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json(
        { error: 'documents must be a non-empty array' },
        { status: 400 }
      );
    }

    // Converti i documenti da base64 a Buffer
    const buffers = documents.map((doc: string) => Buffer.from(doc, 'base64'));

    // Merge iterativo
    let result: Buffer = buffers[0];
    for (let i = 1; i < buffers.length; i++) {
      const merged = mergeDocx(result, buffers[i], { insertEnd: true });
      if (!merged) {
        throw new Error(`Errore durante il merge dei documenti ${i - 1} e ${i}`);
      }
      result = merged as Buffer;
    }

    // Ritorna come base64
    return NextResponse.json({
      document: result.toString('base64'),
    });
  } catch (error: any) {
    console.error('[merge-docx]', error);
    return NextResponse.json(
      { error: error?.message || 'Errore durante il merge dei documenti' },
      { status: 500 }
    );
  }
}
