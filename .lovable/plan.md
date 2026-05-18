## Problema

Em `src/routes/index.tsx`, a coloração (verde/vermelho) dos botões/cards do cabeçalho usa:

```ts
const faturamentoBateuCusto = currentMonthFaturamento >= averageMonthlyExpense;
```

Ou seja, compara a receita acumulada do mês corrente com a despesa média mensal inteira. No início do mês a receita acumulada é naturalmente baixa, então sempre fica vermelho até quase o fim do mês — mesmo quando o ritmo diário de faturamento está acima do necessário.

## Solução

Comparar a receita acumulada com a **meta prorratada por dias úteis já decorridos** no mês:

```
metaProrratada = diariaEmpresarial * diasÚteisDecorridos
              = (averageMonthlyExpense / businessDays) * diasÚteisDecorridos
```

Assim, no dia 1 a meta é ~1 diária; no fim do mês a meta converge para `averageMonthlyExpense` (comportamento atual preservado para meses fechados). Se o mês visualizado não for o mês corrente (navegação para meses passados/futuros), usar a meta cheia para não distorcer.

## Mudanças

Arquivo único: `src/routes/index.tsx`

1. Adicionar `businessDaysElapsed` via `useMemo`: conta dias úteis (seg–sex) entre o dia 1 e `min(hoje, último dia do mês visualizado)`. Reutilizar a mesma lógica/helper já usado em `getBusinessDaysInMonth`.
2. Calcular `proratedExpenseTarget`:
   - Se `year`/`month` = mês/ano atuais → `diariaEmpresarial * businessDaysElapsed` (com mínimo de 1 dia útil para evitar zero no dia 1).
   - Caso contrário → `averageMonthlyExpense` (comportamento atual).
3. Trocar `faturamentoBateuCusto` para `currentMonthFaturamento >= proratedExpenseTarget`.

Nada de lógica de negócio, schema ou outros componentes muda. Tooltips informativos (Diária Empresarial etc.) permanecem iguais — eles já explicam a fórmula correta.
