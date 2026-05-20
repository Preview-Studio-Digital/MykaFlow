import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export async function generateAlertAnalysis(
  category: string, 
  type: string, 
  currentAmount: number, 
  prevAmount: number,
  percentDiff: number
): Promise<string> {
  if (!API_KEY) {
    return "Chave de API do Gemini não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env.";
  }

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const isIncome = type === "income";
    const direction = currentAmount > prevAmount ? "aumentou" : "caiu";
    
    let specialContext = "";
    if (category === "ANTECIPAÇÃO DE NOTAS") {
       specialContext = "Lembre-se: aumento de antecipações de notas como receita é um SINAL NEGATIVO (fluxo de caixa prejudicado, antecipando recebíveis). Queda é sinal positivo.";
    } else if (category === "CUSTO ANTECIPAÇÃO") {
       specialContext = "Lembre-se: aumento no custo de antecipações é um PÉSSIMO sinal financeiro (maior custo operacional/dependência). Queda é excelente.";
    } else if (isIncome) {
       specialContext = "Para receitas em geral, aumento é bom e queda é ruim.";
    } else {
       specialContext = "Para despesas em geral, aumento é ruim (a menos que seja justificado por investimento) e queda é boa.";
    }

    const prompt = `Você é um Diretor Financeiro (CFO) experiente, analítico e muito direto.
Sua tarefa é analisar a seguinte variação no fluxo de caixa da empresa e dar um alerta/conselho executivo.

DADOS:
- Categoria: ${category} (${isIncome ? 'Receita' : 'Despesa'})
- Valor mês passado: R$ ${prevAmount.toFixed(2)}
- Valor mês atual: R$ ${currentAmount.toFixed(2)}
- Variação: ${direction} ${Math.abs(percentDiff).toFixed(1)}%

REGRAS DE NEGÓCIO IMPORTANTES: 
${specialContext}

REGRAS DE ESCRITA:
1. Escreva APENAS UMA frase curta e estratégica (máximo de 18 palavras).
2. Vá direto ao ponto, não use saudações.
3. Foque na interpretação e em que atitude tomar.
4. NÃO repita os valores numéricos, concentre-se no impacto do comportamento.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error("Erro na IA:", error);
    return "Não foi possível gerar análise com IA no momento. Tente novamente mais tarde.";
  }
}
