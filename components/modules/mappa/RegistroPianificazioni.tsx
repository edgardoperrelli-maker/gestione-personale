'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Piano {
  id: string;
  data: string;
  territorio: string;
  note?: string;
  stato: string;
  created_at: string;
  mappa_piani_operatori: Array<{
    staff_id: string;
    staff_name: string;
  }>;
}

export default function RegistroPianificazioni() {
  const [piani, setPiani] = useState<Piano[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    const fetchPiani = async () => {
      try {
        const response = await fetch('/api/mappa/piani');

        if (!response.ok) {
          console.error('API error:', response.status, response.statusText);
          setPiani([]);
          setLoading(false);
          return;
        }

        const data = await response.json();

        // Assicurati che data sia un array
        if (Array.isArray(data)) {
          setPiani(data);
        } else if (data?.error) {
          console.error('API error:', data.error);
          setPiani([]);
        } else {
          console.error('Expected array, got:', typeof data, data);
          setPiani([]);
        }
      } catch (error) {
        console.error('Error fetching piani:', error);
        setPiani([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPiani();
  }, []);

  const handleDelete = async (pianoId: string) => {
    if (!confirm('Elimina questa pianificazione? Questa azione non può essere annullata.')) {
      return;
    }

    setDeleting(pianoId);
    try {
      const response = await fetch(`/api/mappa/piani?id=${pianoId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setPiani(piani.filter((p) => p.id !== pianoId));
      } else {
        alert('Errore durante l\'eliminazione');
      }
    } catch (error) {
      console.error('Error deleting piano:', error);
      alert('Errore durante l\'eliminazione');
    } finally {
      setDeleting(null);
    }
  };

  const handleReopen = (pianoId: string) => {
    window.location.href = `/hub/mappa?vista=pianifica&pianoId=${pianoId}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">Caricamento pianificazioni...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registro Pianificazioni</h1>
          <p className="mt-1 text-sm text-gray-500">
            {piani.length} pianificazione{piani.length !== 1 ? 'i' : ''}
          </p>
        </div>
        <Link
          href="/hub/mappa?vista=pianifica"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nuova pianificazione
        </Link>
      </div>

      {piani.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">Nessuna pianificazione salvata</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Data</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Territorio</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Operatori</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Note</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Stato</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-900">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {piani.map((piano) => (
                <tr key={piano.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {new Date(piano.data).toLocaleDateString('it-IT', {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{piano.territorio}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {piano.mappa_piani_operatori.length}
                  </td>
                  <td className="px-4 py-3 truncate text-gray-500">
                    {piano.note ? (
                      <span title={piano.note}>{piano.note}</span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        piano.stato === 'confermato'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {piano.stato === 'confermato' ? 'Confermato' : 'Bozza'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleReopen(piano.id)}
                      className="mr-2 rounded border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      disabled={deleting === piano.id}
                    >
                      Riapri
                    </button>
                    <button
                      onClick={() => handleDelete(piano.id)}
                      className="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                      disabled={deleting === piano.id}
                    >
                      {deleting === piano.id ? 'Eliminazione...' : 'Elimina'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
