import { z } from 'zod';
import { INFO_CAMPI_DISPONIBILI, type InfoChiave } from '@/utils/rapportini/infoCampi';

/**
 * Schema di validazione del template rapportini (lato API admin).
 * Estratto dalla route per essere testabile.
 */

/** Chiavi info ammesse = quelle disponibili nell'editor (unica fonte di verità → niente drift). */
const INFO_CHIAVI = INFO_CAMPI_DISPONIBILI.map((c) => c.chiave) as [InfoChiave, ...InfoChiave[]];

export const CampoSchema = z.object({
  chiave: z.string().min(1), etichetta: z.string().min(1),
  tipo: z.enum(['crocetta', 'testo', 'select', 'numero', 'foto']),
  opzioni: z.array(z.string()).optional(),
  obbligatoria: z.boolean().optional(),
  scope_foto: z.enum(['misuratore', 'fase', 'accessoria']).optional(),
  ordine: z.number().int(),
});

export const InfoCampoSchema = z.object({
  chiave: z.enum(INFO_CHIAVI),
  etichetta: z.string().min(1),
  ordine: z.number().int(),
});

export const TitoloCampiSchema = z.array(z.enum(INFO_CHIAVI)).default([]);

// Deve specchiare FotoIdCampo in lib/interventi/manuali/fotoNaming.ts (enum inline, come INFO_CHIAVI).
export const FotoIdPrioritySchema = z
  .array(z.enum(['pdr', 'matricola', 'odl', 'indirizzo']))
  .default([]);

export const TemplateSchema = z.object({
  nome: z.string().min(1),
  committente: z.enum(['acea', 'italgas', 'altro', 'lim_massive']).nullable().optional(),
  campi: z.array(CampoSchema).min(1),
  info_campi: z.array(InfoCampoSchema).default([]),
  titolo_campi: TitoloCampiSchema,
  foto_id_priority: FotoIdPrioritySchema,
  tipo: z.enum(['standard', 'risanamento']).optional().default('standard'),
  active: z.boolean().optional().default(true),
  solo_manuale: z.boolean().optional().default(false),
  /** Template "task-via" (solo via): i rapportini generati con questo template mostrano il contenitore + "+". */
  task_via: z.boolean().optional().default(false),
  /** Template "ibrido": attività classiche + voci BONIFICHE EXTRA (task-via) nello stesso rapportino. */
  task_via_ibrido: z.boolean().optional().default(false),
});
