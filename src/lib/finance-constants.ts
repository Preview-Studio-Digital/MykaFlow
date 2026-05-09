export const EXPENSE_CATEGORIES = [
  "Energia",
  "Água",
  "Internet",
  "Telefonia",
  "Pessoal",
  "Contábil",
  "Jurídico",
  "Fornecedores",
  "Frota",
  "IPTU",
  "Aluguel",
  "Marketing",
  "Outros",
];

export const INCOME_CATEGORIES = [
  "Vendas",
  "Serviços",
  "Investimentos",
  "Comissões",
  "Outros",
];

export const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function fmtCurrency(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
