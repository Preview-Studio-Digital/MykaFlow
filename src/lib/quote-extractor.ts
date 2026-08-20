import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

export interface ExtractedQuoteData {
  quoteNumber: string; // Ex: "10533"
  quoteDate: string;   // Ex: "19/08/2026"
  validUntil?: string; // Ex: "24/08/2026"
  customerName: string; // Ex: "SCORRO INDUSTRIA E COMERCIO LTDA"
  cnpj?: string;        // Ex: "61.139.556/0001-58"
  equipment?: string;   // Ex: "COMPRESSOR DE AR LUBRIFICADO"
  totalPieces: number;  // Ex: 3810.44
  totalServices: number;// Ex: 19379.20
  freightValue: number; // Ex: 800.00
  totalAmount: number;  // Ex: 23989.64
  paymentTerms?: string;// Ex: "À VISTA"
  issuerName?: string;  // Ex: "MICHELY FONTES"
}

// Converte Blob/File em Base64 para envio à IA
async function fileToGenerativePart(file: Blob, mimeType: string) {
  return new Promise<{ inlineData: { data: string; mimeType: string } }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(",")[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Analisa e extrai os campos estruturados do orçamento padrão Myka Compressores
 */
export async function extractQuoteDataFromDocument(fileBlob: Blob, mimeType: string): Promise<ExtractedQuoteData | null> {
  if (!API_KEY) {
    console.warn("Chave VITE_GEMINI_API_KEY não configurada para OCR.");
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Ajusta o MIME type se necessário
    const effectiveMime = mimeType === "application/pdf" ? "application/pdf" : (mimeType.startsWith("image/") ? mimeType : "image/jpeg");
    const filePart = await fileToGenerativePart(fileBlob, effectiveMime);

    const prompt = `Você é um extrator de dados financeiro de alta precisão especializado em orçamentos da MYKA COMPRESSORES DO BRASIL.
Analise a imagem/PDF do orçamento oficial e retorne APENAS um JSON válido (sem blocos markdown adicionais ou formatação extra) contendo rigorosamente a estrutura abaixo:

{
  "quoteNumber": "número do orçamento (ex: 10533)",
  "quoteDate": "data do orçamento (ex: 19/08/2026)",
  "validUntil": "data de validade se houver (ex: 24/08/2026)",
  "customerName": "Razão Social ou Nome do Cliente (ex: SCORRO INDUSTRIA E COMERCIO LTDA)",
  "cnpj": "CNPJ/CPF do cliente se houver",
  "equipment": "descrição do equipamento/marca/modelo se houver",
  "totalPieces": número float do TOTAL DE PEÇAS (ex: 3810.44 ou 0),
  "totalServices": número float do TOTAL DE REVISÃO / SERVIÇOS (ex: 19379.20 ou 0),
  "freightValue": número float do Valor Frete (ex: 800.00 ou 0),
  "totalAmount": número float do TOTAL GERAL (ex: 23989.64),
  "paymentTerms": "Forma de pagamento (ex: À VISTA, 30 DIAS, etc)",
  "issuerName": "Nome do emissor/contato que assina no rodapé (ex: MICHELY FONTES)"
}`;

    const result = await model.generateContent([prompt, filePart]);
    const responseText = result.response.text();
    
    // Limpa possíveis marcadores markdown do json ```json ... ```
    const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson) as ExtractedQuoteData;
    
    return {
      quoteNumber: String(parsed.quoteNumber || "").trim(),
      quoteDate: String(parsed.quoteDate || "").trim(),
      validUntil: parsed.validUntil ? String(parsed.validUntil).trim() : undefined,
      customerName: String(parsed.customerName || "").trim().toUpperCase(),
      cnpj: parsed.cnpj ? String(parsed.cnpj).trim() : undefined,
      equipment: parsed.equipment ? String(parsed.equipment).trim() : undefined,
      totalPieces: Number(parsed.totalPieces) || 0,
      totalServices: Number(parsed.totalServices) || 0,
      freightValue: Number(parsed.freightValue) || 0,
      totalAmount: Number(parsed.totalAmount) || 0,
      paymentTerms: parsed.paymentTerms ? String(parsed.paymentTerms).trim() : undefined,
      issuerName: parsed.issuerName ? String(parsed.issuerName).trim() : undefined,
    };
  } catch (err) {
    console.error("Erro ao extrair dados do orçamento via IA:", err);
    return null;
  }
}
