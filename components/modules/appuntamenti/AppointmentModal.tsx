'use client';

import { chiediConferma } from '@/components/ui/chiediConferma';
import { toast } from '@/components/ui/Toast';
import { useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import {
  coloreCommittente,
  committentiAttivi,
  territoriDelCommittente,
  type Committente,
} from '@/lib/contratti/tipi';

type RefNome = { id: string; nome: string } | null;

export type Appointment = {
  id: string;
  pdr: string;
  nome_cognome: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  lat: number | null;
  lng: number | null;
  data: string;
  fascia_oraria: string | null;
  tipo_intervento: string | null;
  territorio_id: string | null;
  committente_id: string | null;
  appuntamento_territorio_id: string | null;
  note: string | null;
  status: 'pending' | 'confirmed';
  territories: { id: string; name: string } | null;
  committente: RefNome;
  appuntamento_territorio: RefNome;
};

type Props =
  | { mode: 'view'; appointment: Appointment; onClose: () => void; onDelete: (id: string) => void }
  | {
      mode: 'create';
      defaultDate?: string;
      committenti: Committente[];
      onClose: () => void;
      onCreate: (appointment: Appointment) => void;
    };

export default function AppointmentModal(props: Props) {
  if (props.mode === 'view') return <ViewMode {...props} />;
  return <CreateMode {...props} />;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-[var(--brand-text-muted)]">{label}</div>
      <div className="mt-0.5 text-sm text-[var(--brand-text-main)]">{children}</div>
    </div>
  );
}

function ViewMode({ appointment, onClose, onDelete }: { appointment: Appointment; onClose: () => void; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!(await chiediConferma({ title: 'Eliminare questo appuntamento?', confirmLabel: 'Elimina', danger: true }))) return;
    setDeleting(true);
    const res = await fetch(`/api/appointments?id=${appointment.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Errore durante l’eliminazione'); setDeleting(false); return; }
    onDelete(appointment.id);
    onClose();
  };

  const territorio = appointment.appuntamento_territorio?.nome ?? appointment.territories?.name ?? null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={appointment.pdr}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Chiudi</Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>Elimina</Button>
        </>
      }
    >
      <div className="space-y-4">
        {(appointment.committente || territorio) && (
          <div className="flex items-center gap-2">
            <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: coloreCommittente(appointment.committente_id ?? appointment.committente?.nome) }} aria-hidden />
            <span className="text-sm font-semibold text-[var(--brand-text-main)]">
              {appointment.committente?.nome ?? '—'}{territorio ? ` · ${territorio}` : ''}
            </span>
          </div>
        )}
        {appointment.nome_cognome && <Campo label="Nome e cognome">{appointment.nome_cognome}</Campo>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Data">
            {new Date(appointment.data + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Campo>
          {appointment.fascia_oraria && <Campo label="Fascia oraria"><span className="font-mono tabular-nums">{appointment.fascia_oraria}</span></Campo>}
        </div>
        {appointment.tipo_intervento && <Campo label="Tipo intervento">{appointment.tipo_intervento}</Campo>}
        {(appointment.indirizzo || appointment.cap || appointment.citta) && (
          <Campo label="Indirizzo">{[appointment.indirizzo, appointment.cap, appointment.citta].filter(Boolean).join(', ')}</Campo>
        )}
        {appointment.note && <Campo label="Note">{appointment.note}</Campo>}
        <Campo label="Stato">{appointment.status === 'pending' ? 'In sospeso' : 'Confermato'}</Campo>
      </div>
    </Dialog>
  );
}

function CreateMode({ defaultDate, committenti, onClose, onCreate }: {
  defaultDate?: string;
  committenti: Committente[];
  onClose: () => void;
  onCreate: (appointment: Appointment) => void;
}) {
  const [pdr, setPdr] = useState('');
  const [nomeCognome, setNomeCognome] = useState('');
  const [data, setData] = useState(defaultDate || '');
  const [fasciaOraria, setFasciaOraria] = useState('');
  const [tipoIntervento, setTipoIntervento] = useState('');
  const [committenteId, setCommittenteId] = useState('');
  const [territorioId, setTerritorioId] = useState('');
  const [indirizzo, setIndirizzo] = useState('');
  const [cap, setCap] = useState('');
  const [citta, setCitta] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const committentiSel = useMemo(() => committentiAttivi(committenti), [committenti]);
  const territoriSel = useMemo(
    () => territoriDelCommittente(committentiSel.find((c) => c.id === committenteId)),
    [committentiSel, committenteId],
  );

  const onCommittente = (id: string) => {
    setCommittenteId(id);
    setTerritorioId(''); // il territorio dipende dal committente: azzera alla scelta
  };

  const handleSubmit = async () => {
    if (!committenteId) { toast.error('Committente obbligatorio'); return; }
    if (!territorioId) { toast.error('Territorio obbligatorio'); return; }
    if (!pdr.trim()) { toast.error('PDR obbligatorio'); return; }
    if (!data.trim()) { toast.error('Data obbligatoria'); return; }

    setLoading(true);
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pdr: pdr.trim(),
        nome_cognome: nomeCognome.trim() || null,
        data: data.trim(),
        fascia_oraria: fasciaOraria.trim() || null,
        tipo_intervento: tipoIntervento.trim() || null,
        committente_id: committenteId,
        appuntamento_territorio_id: territorioId,
        indirizzo: indirizzo.trim() || null,
        cap: cap.trim() || null,
        citta: citta.trim() || null,
        note: note.trim() || null,
        lat: null,
        lng: null,
      }),
    });
    setLoading(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(`Errore: ${err.error || 'sconosciuto'}`);
      return;
    }
    const json = await res.json() as { appointment?: Appointment };
    if (json.appointment) onCreate(json.appointment);
  };

  const labelCls = 'mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]';

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nuovo appuntamento"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>Annulla</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={loading}>Crea</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Committente *</span>
            <Select value={committenteId} onChange={(e) => onCommittente(e.target.value)}>
              <option value="">Scegli committente…</option>
              {committentiSel.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className={labelCls}>Territorio *</span>
            <Select value={territorioId} onChange={(e) => setTerritorioId(e.target.value)} disabled={!committenteId}>
              <option value="">{committenteId ? 'Scegli territorio…' : 'Scegli prima il committente'}</option>
              {territoriSel.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>PDR *</span>
            <Input value={pdr} onChange={(e) => setPdr(e.target.value)} placeholder="Inserisci PDR" />
          </label>
          <label className="block">
            <span className={labelCls}>Nome e cognome</span>
            <Input value={nomeCognome} onChange={(e) => setNomeCognome(e.target.value)} placeholder="Nome e cognome" />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Data *</span>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelCls}>Fascia oraria</span>
            <Input value={fasciaOraria} onChange={(e) => setFasciaOraria(e.target.value)} placeholder="es. 08:00-12:00" />
          </label>
        </div>

        <label className="block">
          <span className={labelCls}>Tipo intervento</span>
          <Input value={tipoIntervento} onChange={(e) => setTipoIntervento(e.target.value)} placeholder="Tipo intervento" />
        </label>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_110px_minmax(0,180px)]">
          <label className="block">
            <span className={labelCls}>Indirizzo</span>
            <Input value={indirizzo} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Indirizzo" />
          </label>
          <label className="block">
            <span className={labelCls}>CAP</span>
            <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="CAP" />
          </label>
          <label className="block">
            <span className={labelCls}>Città</span>
            <Input value={citta} onChange={(e) => setCitta(e.target.value)} placeholder="Città" />
          </label>
        </div>

        <label className="block">
          <span className={labelCls}>Note</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Note aggiuntive" />
        </label>
      </div>
    </Dialog>
  );
}
