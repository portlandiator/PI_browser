// Public display policy; editorial matching status and review queues remain intact.
export const isPublicSelection=s=>s.status!=='rejected'&&!(s.status==='unmatched'&&s.provenance?.sourceCollection==='subjects_inv_length_ordered');
export const hasPublicMatch=s=>['exact','normalized','confirmed','approximate'].includes(s.status)&&Boolean(s.candidates?.[0]?.ranges?.length);
export const isVerifiedMatch=s=>['exact','normalized','confirmed'].includes(s.status);
