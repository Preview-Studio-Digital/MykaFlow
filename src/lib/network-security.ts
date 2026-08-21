import { supabase } from "@/integrations/supabase/client";

// IP Padrão Inicial (IP atual da sua conexão)
export const DEFAULT_ALLOWED_IPS = ["177.212.224.153"];

export interface NetworkSecurityCheck {
  allowed: boolean;
  clientIp: string;
  allowedIps: string[];
  reason?: string;
}

// Helper para obter o IP público real do cliente
export async function getClientPublicIp(): Promise<string> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
    if (!res.ok) throw new Error("Falha ipify");
    const data = await res.json();
    return data.ip || "0.0.0.0";
  } catch {
    try {
      const res2 = await fetch("https://ipinfo.io/json", { cache: "no-store" });
      if (!res2.ok) throw new Error("Falha ipinfo");
      const data2 = await res2.json();
      return data2.ip || "0.0.0.0";
    } catch {
      return "0.0.0.0";
    }
  }
}

// Helper para buscar lista de IPs autorizados da empresa
export async function fetchAllowedIps(): Promise<string[]> {
  try {
    const local = localStorage.getItem("mykaflow_allowed_ips");
    if (local) {
      const parsedLocal = JSON.parse(local);
      if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
        return parsedLocal;
      }
    }
  } catch {}

  return DEFAULT_ALLOWED_IPS;
}

// Salvar novos IPs autorizados (pelo ADM)
export async function saveAllowedIps(newIps: string[]): Promise<boolean> {
  const cleanIps = newIps.map((ip) => ip.trim()).filter(Boolean);
  try {
    localStorage.setItem("mykaflow_allowed_ips", JSON.stringify(cleanIps));
    return true;
  } catch {
    return true;
  }
}

// Registrar tentativa de acesso externo e gerar alerta para o ADM
export async function registerUnauthorizedAccessAttempt(params: {
  userId?: string;
  userName?: string;
  userEmail?: string;
  attemptedIp: string;
}) {
  const { userId, userName, userEmail, attemptedIp } = params;
  const nowIso = new Date().toISOString();
  const displayName = userName || userEmail || "Usuário não identificado";

  const alertDescription = `🚨 ALERTA DE SEGURANÇA: Tentativa de acesso fora da empresa por ${displayName} (E-mail: ${userEmail || "N/A"}) via IP: ${attemptedIp} em ${new Date().toLocaleString("pt-BR")}.`;

  try {
    // 1. Grava no histórico geral / auditoria para aparecer na Central ADM
    await supabase.from("crm_deal_history").insert({
      deal_id: null as any,
      user_id: userId || null,
      user_name: "SISTEMA DE SEGURANÇA",
      action_type: "security_unauthorized_ip",
      description: alertDescription,
      created_at: nowIso,
    });
  } catch (err) {
    console.warn("Falha ao registrar histórico de segurança no banco:", err);
  }

  // 2. Salva no registro de auditoria local de segurança
  try {
    const localAlerts = JSON.parse(localStorage.getItem("mykaflow_security_alerts") || "[]");
    localAlerts.unshift({
      id: crypto.randomUUID(),
      userId,
      userName: displayName,
      userEmail,
      ip: attemptedIp,
      created_at: nowIso,
      description: alertDescription,
    });
    localStorage.setItem("mykaflow_security_alerts", JSON.stringify(localAlerts.slice(0, 50)));
  } catch {}
}
