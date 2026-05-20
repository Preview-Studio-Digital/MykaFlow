UPDATE public.transactions
SET description = 'SYNC: ' || trim(split_part(description, ' - SYNC NF:', 1))
WHERE description ~ ' - SYNC NF: .* \[.*\]$';