## Diagnóstico

As tabelas necessárias já existem no banco (`profiles`, `user_roles`, `financial_categories`, `financial_subcategories`, `transactions`). O formulário falha por **dois motivos reais**, não por falta de banco:

1. **Bug de runtime no `TransactionForm.tsx`** (linha 329): chama `setSubCategory("")`, função que não existe. Quando você seleciona uma categoria, o JavaScript quebra silenciosamente e impede o salvamento.
2. **Esquema com pontas soltas** que atrapalham os gráficos:
   - `financial_subcategories.category_id` é nullable (subcategoria pode ficar órfã).
   - Não há `FOREIGN KEY` real entre subcategoria → categoria, nem entre `transactions.category_id_v2` → `financial_categories`.
   - RLS de categorias está como "Acesso Livre" / "Permitir Tudo" — qualquer usuário vê e edita categorias dos outros.
   - Existem colunas legadas duplicadas em `transactions` (`category_id`, `subcategory_id`, `category_id_v2`, `subcategory_id_v2`) que confundem o gráfico de pizza.

## O que vou fazer

### 1. Corrigir o bug do formulário
- Trocar `setSubCategory("")` por `setSelectedSubId("")` em `src/components/TransactionForm.tsx`.

### 2. Migração de banco para consolidar o esquema
- Tornar `financial_subcategories.category_id` **NOT NULL** + adicionar `FOREIGN KEY` para `financial_categories(id) ON DELETE CASCADE`.
- Adicionar `FOREIGN KEY` em `transactions.category_id_v2` → `financial_categories(id)` e `transactions.subcategory_id_v2` → `financial_subcategories(id)`.
- Renomear `category_id_v2` → `category_id` e `subcategory_id_v2` → `subcategory_id` (depois de migrar dados das colunas antigas, se houver).
- Remover colunas legadas `category_id`/`subcategory_id` antigas vazias e a coluna texto `category` (ou mantê-la apenas como cache, a confirmar — ver pergunta abaixo).
- Substituir as policies "Acesso Livre"/"Permitir Tudo" das categorias por:
  - SELECT: qualquer usuário autenticado (categorias são compartilhadas) **ou** apenas o dono — depende da resposta abaixo.
  - INSERT/UPDATE/DELETE: apenas o dono (`auth.uid() = user_id`) ou admin (`has_role(...)`).
- Criar índices em `transactions(user_id, occurred_on)`, `transactions(category_id)`, `financial_subcategories(category_id)` para acelerar os gráficos.

### 3. Ajustar componentes que leem o esquema
- Atualizar `TransactionForm.tsx`, `CategoryPie.tsx`, `EvolutionChart.tsx`, `TransactionList.tsx`, `TransactionEditDialog.tsx` para usarem os nomes finais de coluna (`category_id` / `subcategory_id`).
- Regenerar `src/integrations/supabase/types.ts` (automático após a migração).

### 4. Validação
- Testar fluxo: criar categoria → criar subcategoria → registrar despesa → ver no gráfico de pizza e na lista.

## Perguntas antes de eu escrever a migração

Preciso de duas decisões suas para fechar o esquema:

1. **Categorias são compartilhadas entre todos os usuários do sistema, ou cada usuário tem as suas?**
   (Hoje cada categoria tem `user_id`, mas a RLS deixa todos verem tudo — preciso saber qual é o comportamento desejado.)

2. **Posso remover as colunas legadas `category` (texto), `category_id` e `subcategory_id` antigas de `transactions`?**
   Se houver lançamentos antigos usando só o texto `category`, eu migro esses dados para as novas FKs antes de remover.
