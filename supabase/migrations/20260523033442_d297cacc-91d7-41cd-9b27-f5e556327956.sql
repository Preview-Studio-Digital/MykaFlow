UPDATE public.transactions
SET description = regexp_replace(
  regexp_replace(description, '^.*?(SYNC\s*:?\s*NF\s*.*)$', '\1', 'i'),
  '^SYNC\s+NF\s*:?\s*',
  'SYNC: NF ',
  'i'
)
WHERE upper(category) IN ('ANTECIPAÇÃO DE NOTAS', 'CUSTO ANTECIPAÇÃO')
  AND description IS NOT NULL
  AND description ~* 'SYNC\s*:?\s*NF'
  AND description !~* '^SYNC:\s*NF';