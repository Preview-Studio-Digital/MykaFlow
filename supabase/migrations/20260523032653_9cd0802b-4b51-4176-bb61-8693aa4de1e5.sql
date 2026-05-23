
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, subcategory_id_v2, occurred_on, amount, type
           ORDER BY created_at ASC
         ) AS rn
  FROM public.transactions
  WHERE category IN ('ANTECIPAÇÃO DE NOTAS', 'CUSTO ANTECIPAÇÃO')
)
DELETE FROM public.transactions
WHERE id IN (SELECT id FROM dups WHERE rn > 1);
