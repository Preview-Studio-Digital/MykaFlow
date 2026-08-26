import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { ProfileDialog } from "@/components/ProfileDialog";
import { extractQuoteDataFromDocument, type ExtractedQuoteData } from "@/lib/quote-extractor";
import {
  Users,
  Kanban,
  LayoutGrid,
  Plus,
  ArrowLeft,
  Briefcase,
  Layers,
  Clock,
  CheckCircle2,
  Lock,
  LogOut,
  ShieldCheck,
  User,
  User as UserIcon,
  History,
  Send,
  MessageSquare,
  UserCheck,
  AlertCircle,
  AlertTriangle,
  Bell,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  Calendar,
  Sparkles,
  Building,
  Globe,
  Search,
  Filter,
  ArrowRight,
  FileText,
  Save,
  Trash2,
  Archive,
  ArchiveRestore,
  FolderArchive,
  Menu,
  PlusCircle,
  CheckSquare,
  Building2,
  Phone,
  FolderKanban,
  Paperclip,
  UploadCloud,
  FileCheck,
  Eye,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsRight,
  ChevronsLeft,
  GitFork,
  ListTree,
  Pencil,
  Check,
  Play,
  Pause,
  Timer,
  TrendingUp,
  BarChart3,
  AtSign,
  Reply,
  Inbox,
  CheckCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  InboxModal,
  getDealCompletionNotifications,
  isDealPendingAuthorAcceptance,
  type TaskCompletionNotification,
} from "@/components/InboxModal";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  isBusinessWorkTime,
  getAutoCutoffInfo,
  type WorkScheduleInfo,
} from "@/lib/work-schedule";
import {
  recordActivitySessionAudit,
  recordInactivitySeconds,
} from "@/lib/work-time-tracker";
import { ConfirmModal } from "@/components/ConfirmModal";

export const Route = createFileRoute("/crm")({
  component: CrmDashboard,
});

export interface DealHistoryItem {
  id: string;
  deal_id: string;
  user_name: string;
  action_type: string;
  description: string;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
}

export interface Deal {
  id: string;
  customer_id?: string | null;
  customer_name?: string;
  title: string;
  value: number;
  stage: "lead" | "qualification" | "proposal" | "negotiation" | "won" | "lost" | "archived" | "completed";
  expected_close_date?: string | null;
  assigned_user_id?: string | null;
  assigned_user_name?: string | null;
  user_id?: string;
  creator_name?: string;
  latest_update_author?: string;
  notes?: string;
  req_number?: string | null;
  quote_file_url?: string | null;
  quote_file_name?: string | null;
  quote_file_uploaded_at?: string | null;
  is_working?: boolean;
  working_user_id?: string | null;
  working_user_name?: string | null;
  working_started_at?: string | null;
  latest_update_at?: string;
  created_at: string;
  updated_at: string;
}

// Helper para escapar strings em expressões regulares
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface DealMentionReply {
  id: string;
  mention_id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  reply_text: string;
  created_at: string;
}

export interface DealMention {
  id: string;
  deal_id: string;
  author_id: string;
  author_name: string;
  mentioned_user_id: string;
  mentioned_user_name: string;
  content: string;
  created_at: string;
  read_by_user?: boolean;
  replies?: DealMentionReply[];
}

// Helper para obter todas as menções vinculadas a um deal
function getDealMentions(deal: Deal | null): DealMention[] {
  if (!deal || !deal.notes) return [];
  const mentions: DealMention[] = [];
  try {
    const regex = /\[MENTION:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && parsed.mentioned_user_id) {
            mentions.push(parsed);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return mentions;
}

// Helper para obter todas as respostas de menções de um deal
function getDealMentionReplies(deal: Deal | null): DealMentionReply[] {
  if (!deal || !deal.notes) return [];
  const replies: DealMentionReply[] = [];
  try {
    const regex = /\[MENTION_REPLY:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && parsed.mention_id) {
            replies.push(parsed);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return replies;
}

export interface DealSubtaskCompletion {
  id: string;
  subtaskId: string;
  subtaskTitle: string;
  reqNumber: string;
  userName: string;
  user_id: string;
  completionText: string;
  created_at: string;
}

// Helper para obter todas as conclusões de tarefas vinculadas registradas na atividade mãe
function getDealSubtaskCompletions(deal: Deal | null): DealSubtaskCompletion[] {
  if (!deal || !deal.notes) return [];
  const completions: DealSubtaskCompletion[] = [];
  try {
    const regex = /\[SUBTASK_COMPLETION:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && parsed.subtaskId) {
            completions.push(parsed);
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return completions;
}

// Helper para obter a data da última visualização do responsável da atividade
function getResponsibleLastSeen(deal: Deal | null): string | null {
  if (!deal || !deal.notes) return null;
  const match = deal.notes.match(/\[RESPONSIBLE_LAST_SEEN:(.*?)\]/);
  return match ? match[1] : null;
}

export interface DealTimeSession {
  id: string;
  deal_id: string;
  user_id: string;
  user_name: string;
  started_at: string;
  ended_at?: string | null;
  duration_seconds?: number;
  stop_reason?: "manual" | "lunch_12h" | "end_of_day_17h30" | "auto_switch";
}

// Helper para garantir exibição apenas do primeiro nome (sem sobrenome para otimizar espaço)
function getFirstName(name?: string | null): string {
  if (!name) return "";
  const clean = name.trim();
  if (clean.includes("@")) {
    return clean.split("@")[0].split(".")[0].toUpperCase();
  }
  return clean.split(" ")[0].toUpperCase();
}

// Helper para tema e cores de perfil (Administrador, Financeiro, Comercial)
function getUserRoleTheme(role?: string | null, email?: string | null) {
  const isAdm = role === "admin" || (email ? email.toLowerCase().includes("admin") : false);
  if (isAdm) {
    return {
      text: "text-amber-300",
      border: "border-amber-500/40",
      bg: "bg-amber-500/20",
      badge: "bg-amber-950/80 text-amber-300 border-amber-500/40",
      indicator: "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.85)]",
      activeItem: "bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.25)]",
      hoverItem: "hover:bg-amber-500/10 hover:text-amber-200",
      iconColor: "text-amber-400",
      roleLabel: "ADMINISTRADOR",
    };
  }
  if (role === "financeiro") {
    return {
      text: "text-emerald-300",
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/20",
      badge: "bg-emerald-950/80 text-emerald-300 border-emerald-500/40",
      indicator: "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.85)]",
      activeItem: "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]",
      hoverItem: "hover:bg-emerald-500/10 hover:text-emerald-200",
      iconColor: "text-emerald-400",
      roleLabel: "FINANCEIRO",
    };
  }
  // Comercial / User
  return {
    text: "text-sky-300",
    border: "border-sky-500/40",
    bg: "bg-sky-500/20",
    badge: "bg-sky-950/80 text-sky-300 border-sky-500/40",
    indicator: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.85)]",
    activeItem: "bg-sky-500/25 text-sky-300 border border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.25)]",
    hoverItem: "hover:bg-sky-500/10 hover:text-sky-200",
    iconColor: "text-sky-400",
    roleLabel: "COMERCIAL",
  };
}

// Helper para obter a sessão ativa de trabalho do deal
function getDealActiveWorker(deal: Deal | null): { userId: string; userName: string; startedAt: string } | null {
  if (!deal || !deal.notes) return null;
  if (deal.notes && deal.notes.includes("[WORK_ACTIVE:")) {
    try {
      const match = deal.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (parsed.userId && parsed.startedAt) {
          return {
            userId: parsed.userId,
            userName: getFirstName(parsed.userName) || "RESPONSÁVEL",
            startedAt: parsed.startedAt,
          };
        }
      }
    } catch (e) {}
  }
  return null;
}

// Helper para obter o histórico completo de sessões de trabalho do deal
function getDealWorkSessions(deal: Deal | null): DealTimeSession[] {
  if (!deal || !deal.notes) return [];
  const sessions: DealTimeSession[] = [];
  try {
    const regex = /\[WORK_LOG:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        sessions.push(JSON.parse(match[1]));
      }
    }
  } catch (e) {}
  return sessions;
}

// Helper para calcular o tempo total trabalhado (em segundos)
function getDealTotalWorkSeconds(deal: Deal | null): number {
  if (!deal) return 0;
  const sessions = getDealWorkSessions(deal);
  let total = sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
  const active = getDealActiveWorker(deal);
  if (active) {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000));
    total += elapsed;
  }
  return total;
}

// Helper para formatar segundos em "00h 00m 00s" ou "00h 00m"
function formatDurationHoursMinutes(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function formatElapsedLive(startedAt: string, currentMs: number = Date.now()): string {
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return "0s";
  const sec = Math.max(0, Math.floor((currentMs - startMs) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export interface Customer {
  id: string;
  name: string;
  company_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  status: string;
}

// Helper de Formatação / Geração do Número de Requisição no padrão: AA.MM.01...
function getDealReqNumber(deal: Deal, allDeals?: Deal[]): string {
  if (deal.req_number && deal.req_number.trim()) {
    return deal.req_number.trim().replace(/\//g, ".");
  }

  const d = new Date(deal.created_at || Date.now());
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}.${mm}`;

  if (!allDeals || allDeals.length === 0) {
    return `${prefix}.01`;
  }

  const sameMonthDeals = allDeals
    .filter((other) => {
      const otherDate = new Date(other.created_at || Date.now());
      const otherYY = String(otherDate.getFullYear()).slice(-2);
      const otherMM = String(otherDate.getMonth() + 1).padStart(2, "0");
      return `${otherYY}.${otherMM}` === prefix;
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const index = sameMonthDeals.findIndex((other) => other.id === deal.id);
  const seq = index >= 0 ? index + 1 : sameMonthDeals.length + 1;
  return `${prefix}.${String(seq).padStart(2, "0")}`;
}

function generateNextReqNumber(existingDeals: Deal[], targetDate = new Date()): string {
  const yy = String(targetDate.getFullYear()).slice(-2);
  const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
  const prefix = `${yy}.${mm}`;

  let maxSeq = 0;
  for (const d of existingDeals) {
    const rawNum = d.req_number || getDealReqNumber(d, existingDeals);
    const num = rawNum ? rawNum.replace(/\//g, ".") : "";
    if (num && num.startsWith(prefix)) {
      const parts = num.split(".");
      const lastPart = parseInt(parts[parts.length - 1].trim(), 10);
      if (!isNaN(lastPart) && lastPart > maxSeq) {
        maxSeq = lastPart;
      }
    }
  }

  return `${prefix}.${String(maxSeq + 1).padStart(2, "0")}`;
}

const STAGES: { id: Deal["stage"]; title: string; color: string; border: string; glow: string; bg?: string }[] = [
  { id: "lead", title: "TAREFAS", color: "text-amber-400", border: "border-amber-500/20", glow: "from-amber-500/10" },
  { id: "qualification", title: "ORÇAMENTOS", color: "text-sky-400", border: "border-sky-500/20", glow: "from-sky-500/10" },
  { id: "negotiation", title: "NEGOCIAÇÕES", color: "text-sky-400", border: "border-sky-500/20", glow: "from-sky-500/10" },
  { id: "won", title: "CONTRATOS", color: "text-sky-400", border: "border-sky-500/20", glow: "from-sky-500/10" },
  { id: "completed", title: "CONCLUÍDOS", color: "text-emerald-400", border: "border-emerald-500/20", glow: "from-emerald-500/10" },
  { id: "lost", title: "PERDIDOS", color: "text-rose-400", border: "border-rose-500/30", glow: "from-rose-500/15", bg: "!bg-rose-950/20" },
];

function fmtCurrency(val: number) {
  return Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Helper de Formatação de Data com Dia da Semana: "PRAZO: dd/mm/aa - dia da semana"
function formatDeadlineWithWeekday(dateStr?: string | null) {
  if (!dateStr) return null;
  try {
    const cleanDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const parts = cleanDate.split("-");
    if (parts.length < 3) return `PRAZO: ${dateStr}`;

    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (isNaN(d.getTime())) return `PRAZO: ${dateStr}`;

    const weekdays = [
      "domingo",
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado",
    ];
    const weekday = weekdays[d.getDay()] || "";
    const shortYear = year.slice(-2);
    return `PRAZO: ${day}/${month}/${shortYear}${weekday ? ` - ${weekday}` : ""}`;
  } catch {
    return `PRAZO: ${dateStr}`;
  }
}

// Helpers para Formatação e Máscara de CNPJ e Telefone
function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 3) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

// Helper padronizado para remover prefixos de categoria (ex: [REQ. INTERNA], [TAREFA], [ORÇAMENTO], etc.)
function getCleanDealTitle(title: string | undefined | null): string {
  if (!title) return "";
  return title.replace(/^\[[^\]]+\]\s*/i, "").trim().toUpperCase();
}

// Helper para identificar se uma atividade é do tipo Orçamento ou Tarefa
function isBudgetDeal(deal: Deal | null): boolean {
  if (!deal) return false;
  const titleUpper = (deal.title || "").toUpperCase();
  if (titleUpper.includes("[ORÇAMENTO]") || titleUpper.includes("[ORCAMENTO]")) return true;
  if (titleUpper.includes("[TAREFA]") || titleUpper.includes("[REQ. INTERNA]") || titleUpper.includes("[REQ.INTERNA]")) return false;
  if (deal.stage === "lead") return false;
  const origin = getArchivedOriginStage(deal);
  if (origin === "lead") return false;
  return true;
}

// Helper para obter o título gramatical correto da duração média por etapa/coluna
function getStageDurationLabel(stageIdOrTitle?: string): string {
  const normalized = (stageIdOrTitle || "").toLowerCase().trim();
  if (normalized === "lead" || normalized === "tarefas" || normalized.includes("tarefa")) {
    return "DURAÇÃO MÉDIA DAS TAREFAS";
  }
  if (normalized === "qualification" || normalized === "orçamentos" || normalized === "orcamentos" || normalized.includes("orçamento") || normalized.includes("orcamento")) {
    return "DURAÇÃO MÉDIA DOS ORÇAMENTOS";
  }
  if (normalized === "negotiation" || normalized === "negociações" || normalized === "negociacoes" || normalized.includes("negocia")) {
    return "DURAÇÃO MÉDIA DAS NEGOCIAÇÕES";
  }
  if (normalized === "won" || normalized === "contratos" || normalized.includes("contrato")) {
    return "DURAÇÃO MÉDIA DOS CONTRATOS";
  }
  if (normalized === "completed" || normalized === "concluídos" || normalized === "concluidos" || normalized.includes("concl")) {
    return "DURAÇÃO MÉDIA DOS CONCLUÍDOS";
  }
  if (normalized === "lost" || normalized === "perdidos" || normalized.includes("perd")) {
    return "DURAÇÃO MÉDIA DOS PERDIDOS";
  }
  return `DURAÇÃO MÉDIA EM ${stageIdOrTitle ? stageIdOrTitle.toUpperCase() : "ATIVIDADES"}`;
}

// Helper para obter a contagem de atividades em aberto formatada por etapa/coluna
function getStageOpenActivitiesLabel(stageIdOrTitle?: string, count = 0): string {
  const normalized = (stageIdOrTitle || "").toLowerCase().trim();
  if (normalized === "lead" || normalized === "tarefas" || normalized.includes("tarefa")) {
    return count === 1 ? "1 TAREFA EM ABERTO" : `${count} TAREFAS EM ABERTO`;
  }
  if (normalized === "qualification" || normalized === "orçamentos" || normalized === "orcamentos" || normalized.includes("orçamento") || normalized.includes("orcamento")) {
    return count === 1 ? "1 ORÇAMENTO EM ABERTO" : `${count} ORÇAMENTOS EM ABERTO`;
  }
  if (normalized === "negotiation" || normalized === "negociações" || normalized === "negociacoes" || normalized.includes("negocia")) {
    return count === 1 ? "1 NEGOCIAÇÃO EM ABERTO" : `${count} NEGOCIAÇÕES EM ABERTO`;
  }
  if (normalized === "won" || normalized === "contratos" || normalized.includes("contrato")) {
    return count === 1 ? "1 CONTRATO EM ABERTO" : `${count} CONTRATOS EM ABERTO`;
  }
  if (normalized === "completed" || normalized === "concluídos" || normalized === "concluidos" || normalized.includes("concl")) {
    return count === 1 ? "1 TAREFA/ORÇAMENTO CONCLUÍDO" : `${count} CONCLUÍDOS`;
  }
  if (normalized === "lost" || normalized === "perdidos" || normalized.includes("perd")) {
    return count === 1 ? "1 PERDIDO" : `${count} PERDIDOS`;
  }
  return count === 1 ? "1 ATIVIDADE EM ABERTO" : `${count} ATIVIDADES EM ABERTO`;
}

export interface DealQuoteFileInfo {
  url: string;
  name: string;
  uploadedAt: string;
  quoteData?: ExtractedQuoteData | null;
}

// Helper para extrair informações do arquivo de orçamento oficial e dados parseados
function getDealQuoteFile(deal: Deal | null, _historyList?: DealHistoryItem[]): DealQuoteFileInfo | null {
  if (!deal) return null;

  let extractedFromNotes: ExtractedQuoteData | null = null;
  if (deal.notes && deal.notes.includes("[QUOTE_DATA:")) {
    try {
      const dMatch = deal.notes.match(/\[QUOTE_DATA:(.*?)\]/);
      if (dMatch && dMatch[1]) {
        extractedFromNotes = JSON.parse(dMatch[1]);
      }
    } catch (e) {}
  }

  if (deal.notes && deal.notes.includes("[QUOTE_FILE:")) {
    try {
      const match = deal.notes.match(/\[QUOTE_FILE:(.*?)\]/);
      if (match && match[1]) {
        const parsed = JSON.parse(match[1]);
        if (parsed.url) {
          return {
            url: parsed.url,
            name: parsed.name || "orcamento_oficial",
            uploadedAt: parsed.uploadedAt || deal.updated_at || deal.created_at,
            quoteData: parsed.quoteData || extractedFromNotes,
          };
        }
      }
    } catch (e) {}
  }

  if (deal.quote_file_url) {
    return {
      url: deal.quote_file_url,
      name: deal.quote_file_name || "orcamento_oficial",
      uploadedAt: deal.quote_file_uploaded_at || deal.updated_at || deal.created_at,
      quoteData: extractedFromNotes,
    };
  }

  return null;
}

// Helper para otimização e compressão leve no client-side antes do upload
async function compressImageForUpload(file: File): Promise<{ file: Blob; fileName: string; isImage: boolean }> {
  if (!file.type.startsWith("image/")) {
    return { file, fileName: file.name, isImage: false };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Dimensão máxima de 1500px para garantir leitura nítida com tamanho mínimo
        const maxDimension = 1500;
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
        }

        // Converte para WebP (ou JPEG) com qualidade 0.70
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const baseName = file.name.replace(/\.[^/.]+$/, "");
              resolve({
                file: blob,
                fileName: `${baseName}_otimizado.webp`,
                isImage: true,
              });
            } else {
              resolve({ file, fileName: file.name, isImage: true });
            }
          },
          "image/webp",
          0.70
        );
      };
      img.onerror = () => resolve({ file, fileName: file.name, isImage: true });
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve({ file, fileName: file.name, isImage: true });
    reader.readAsDataURL(file);
  });
}

// Algoritmo de Cores e Texto de Hover do Prazo:
function getDeadlineInfo(dateStr?: string | null) {
  if (!dateStr) return { colorClass: "text-accent font-bold", hoverText: "", tooltipColorClass: "" };

  try {
    const cleanDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const parts = cleanDate.split("-");
    if (parts.length < 3) return { colorClass: "text-accent font-bold", hoverText: "", tooltipColorClass: "" };

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return { colorClass: "text-accent font-bold", hoverText: "", tooltipColorClass: "" };
    }

    const now = new Date();
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetZero = new Date(year, month - 1, day).getTime();

    // Diferença exata em dias corridos
    const diffDays = Math.round((targetZero - todayZero) / (1000 * 60 * 60 * 24));

    let hoverText = "";
    let colorClass = "";
    let tooltipColorClass = "";

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      hoverText = `Vencida há ${absDays} ${absDays === 1 ? "dia" : "dias"}`;
      colorClass = "text-red-400 font-black animate-pulse";
      tooltipColorClass = "bg-rose-950/95 text-rose-200 border-rose-500/80 shadow-rose-950/60";
    } else if (diffDays === 0) {
      hoverText = "Vence hoje";
      colorClass = "text-rose-400 font-black animate-pulse";
      tooltipColorClass = "bg-rose-950/95 text-rose-200 border-rose-500/80 shadow-rose-950/60";
    } else if (diffDays === 1) {
      hoverText = "Resta 1 dia";
      colorClass = "text-rose-400 font-bold animate-pulse";
      tooltipColorClass = "bg-rose-950/95 text-rose-200 border-rose-500/80 shadow-rose-950/60";
    } else if (diffDays === 2) {
      hoverText = "Restam 2 dias";
      colorClass = "text-amber-400 font-bold animate-pulse";
      tooltipColorClass = "bg-amber-950/95 text-amber-200 border-amber-500/80 shadow-amber-950/60";
    } else if (diffDays === 3) {
      hoverText = "Restam 3 dias";
      colorClass = "text-emerald-400 font-bold";
      tooltipColorClass = "bg-emerald-950/95 text-emerald-200 border-emerald-500/80 shadow-emerald-950/60";
    } else {
      hoverText = `Restam ${diffDays} dias`;
      colorClass = "text-slate-300 font-medium";
      tooltipColorClass = "bg-slate-900/95 text-slate-200 border-white/20 shadow-slate-950/50";
    }

    return { colorClass, hoverText, tooltipColorClass, diffDays };
  } catch {
    return { colorClass: "text-accent font-bold", hoverText: "Prazo da atividade", tooltipColorClass: "bg-slate-900 text-white border-white/20" };
  }
}

function getInternalDeadlineStyle(deadlineStr?: string | null) {
  const deadlineInfo = getDeadlineInfo(deadlineStr);
  const diffDays = deadlineInfo.diffDays;

  // Cor de fundo e borda padrão do card (borda segue o padrão)
  const defaultCardClass = "bg-slate-900/90 border-white/10 text-white shadow-sm";

  // Se não tiver prazo ou o vencimento for de mais de 3 dias (> 3 dias): sem indicador e texto neutro
  if (diffDays === undefined || diffDays > 3) {
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-slate-900/95 text-slate-200 border-white/20 shadow-slate-950/50",
      dotColor: "bg-slate-400",
      hoverText: diffDays === undefined ? "Sem prazo definido" : `Prazo: restam ${diffDays} dias`,
      colorClass: "text-slate-300 font-medium",
      indicatorBadge: null,
      indicatorBadgeClass: "",
      isExpired: false,
      diffDays,
    };
  }

  // Ultrapassou o prazo (< 0 dias) -> Tag e texto vermelhos pulsantes
  if (diffDays < 0) {
    const absDays = Math.abs(diffDays);
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-red-950/95 text-red-200 border-red-500/80 shadow-black",
      dotColor: "bg-red-500",
      hoverText: `Vencida há ${absDays} ${absDays === 1 ? "dia" : "dias"}`,
      colorClass: "text-red-400 font-black animate-pulse",
      indicatorBadge: `Vencida há ${absDays} ${absDays === 1 ? "dia" : "dias"}`,
      indicatorBadgeClass: "bg-red-950/90 text-red-300 border-red-600 font-black animate-pulse rounded-md px-2 py-0.5",
      isExpired: true,
      diffDays,
    };
  }

  // Vence hoje (0 dias) -> Tag "HOJE" e texto vermelhos pulsantes
  if (diffDays === 0) {
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-rose-950/95 text-rose-200 border-rose-500/80 shadow-rose-950/60",
      dotColor: "bg-rose-400",
      hoverText: "Vence hoje",
      colorClass: "text-rose-400 font-black animate-pulse",
      indicatorBadge: "HOJE",
      indicatorBadgeClass: "bg-rose-950/90 text-rose-200 border-rose-500 font-black tracking-tight animate-pulse rounded-md px-2 py-0.5",
      isExpired: false,
      diffDays,
    };
  }

  // 1 dia para o fim do prazo -> Tag "1 DIA" e texto vermelhos pulsantes
  if (diffDays === 1) {
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-rose-950/95 text-rose-200 border-rose-400/70 shadow-rose-900/50",
      dotColor: "bg-rose-400",
      hoverText: "Resta 1 dia",
      colorClass: "text-rose-400 font-bold animate-pulse",
      indicatorBadge: "1 DIA",
      indicatorBadgeClass: "bg-rose-950/80 text-rose-300 border-rose-500/70 font-black animate-pulse rounded-md px-2 py-0.5",
      isExpired: false,
      diffDays,
    };
  }

  // 2 dias para o fim do prazo -> Tag "2 DIAS" e texto amarelos pulsantes
  if (diffDays === 2) {
    return {
      cardClass: defaultCardClass,
      tooltipClass: "bg-amber-950/95 text-amber-200 border-amber-400/70 shadow-amber-900/50",
      dotColor: "bg-amber-400",
      hoverText: "Restam 2 dias",
      colorClass: "text-amber-400 font-bold animate-pulse",
      indicatorBadge: "2 DIAS",
      indicatorBadgeClass: "bg-amber-950/80 text-amber-300 border-amber-500/70 font-black animate-pulse rounded-md px-2 py-0.5",
      isExpired: false,
      diffDays,
    };
  }

  // 3 dias para o fim do prazo -> Tag "3 DIAS" e texto verdes
  return {
    cardClass: defaultCardClass,
    tooltipClass: "bg-emerald-950/95 text-emerald-200 border-emerald-400/70 shadow-emerald-900/50",
    dotColor: "bg-emerald-400",
    hoverText: "Restam 3 dias",
    colorClass: "text-emerald-400 font-bold",
    indicatorBadge: "3 DIAS",
    indicatorBadgeClass: "bg-emerald-950/80 text-emerald-300 border-emerald-500/70 font-black rounded-md px-2 py-0.5",
    isExpired: false,
    diffDays,
  };
}

// Helper para identificar a etapa de origem de uma atividade arquivada ('lead' | 'completed' | 'lost')
function getArchivedOriginStage(deal: Deal): "lead" | "completed" | "lost" {
  if (deal.notes?.includes("ORIGIN_STAGE:lost")) return "lost";
  if (deal.notes?.includes("ORIGIN_STAGE:completed")) return "completed";
  if (deal.notes?.includes("ORIGIN_STAGE:lead")) return "lead";
  // Fallback para itens legados:
  if (deal.title.includes("[TAREFA]") || deal.title.includes("[REQ. INTERNA]") || !deal.customer_id) {
    return "lead";
  }
  return "completed";
}

// Algoritmo de Cores Vivas de Inatividade (Fundo Preenchido e Visível):
// 1º dia (0 a <1 d): Verde Vivo ("atualização hoje")
// 2º dia (1 a <2 d): Verde-Lima / Amarelado ("há 2 dias")
// 3º dia (2 a <3 d): Amarelo Intenso ("há 3 dias")
// Helper para cálculo de dias civis / efetivos (comparação por data calendário, desconsiderando horas corridas)
function getEffectiveCalendarDays(dateStrOrTimestamp?: string | number | Date | null): number {
  if (!dateStrOrTimestamp) return 0;
  try {
    const d = new Date(dateStrOrTimestamp);
    if (isNaN(d.getTime())) return 0;

    const now = new Date();
    const targetMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const diff = Math.round((todayMidnight - targetMidnight) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  } catch {
    return 0;
  }
}

// Algoritmo de Cores Vivas de Inatividade (Fundo Preenchido e Visível):
// HOJE (0 d) e 1º dia (1 d): Verde Esmeralda ("atualizado hoje" / "há 1 dia")
// 2º dia (2 d): Verde-Lima / Amarelado ("há 2 dias")
// 3º dia (3 d): Amarelo Intenso ("há 3 dias")
// 4º dia (4 d): Laranja Forte ("há 4 dias")
// 5º ao 10º dia (5 a 10 d): Vermelho Vibrante ("há X dias")
// > 10 dias até 15 dias: Magenta Intenso ("há X dias")
// > 15 dias: Preto / Grafite Escuro ("+15 dias sem atualização")
function getDealAgingStyle(updatedAtStr: string) {
  const diffDays = getEffectiveCalendarDays(updatedAtStr);

  let hoverText = "";
  if (diffDays === 0) {
    hoverText = "Atualizado hoje";
  } else if (diffDays === 1) {
    hoverText = "Atualizado há 1 dia";
  } else if (diffDays <= 15) {
    hoverText = `Atualizado há ${diffDays} dias`;
  } else {
    hoverText = "+15 dias sem atualização";
  }

  // > 15 dias: Preto / Grafite Escuro
  if (diffDays > 15) {
    return {
      days: diffDays,
      hoverText,
      label: `+15 dias sem atualização`,
      badgeClass: "bg-zinc-950/90 text-zinc-300 border border-zinc-500 font-bold",
      cardClass: "bg-gradient-to-br from-zinc-600/35 via-zinc-950/20 to-slate-950/95 border-2 border-zinc-400 shadow-md shadow-black/80 text-white",
      dotColor: "bg-zinc-400 shadow-[0_0_6px_#a1a1aa]",
      accentText: "text-zinc-400 font-bold",
      tooltipClass: "bg-zinc-950/95 text-zinc-300 border border-zinc-500 shadow-black/80",
    };
  }

  // 11 a 15 dias: Magenta / Fúcsia Intenso
  if (diffDays > 10) {
    return {
      days: diffDays,
      hoverText,
      label: `há ${diffDays} dias`,
      badgeClass: "bg-fuchsia-950/90 text-fuchsia-300 border border-fuchsia-400 font-bold shadow-[0_0_8px_rgba(232,121,249,0.35)]",
      cardClass: "bg-gradient-to-br from-fuchsia-500/35 via-fuchsia-950/20 to-slate-950/95 border-2 border-fuchsia-400 shadow-lg shadow-fuchsia-500/25 text-white",
      dotColor: "bg-fuchsia-400 shadow-[0_0_8px_#e879f9]",
      accentText: "text-fuchsia-400 font-bold drop-shadow-[0_0_6px_rgba(232,121,249,0.5)]",
      tooltipClass: "bg-fuchsia-950/95 text-fuchsia-200 border border-fuchsia-400 shadow-fuchsia-900/50",
    };
  }

  // 5 a 10 dias: Vermelho Vibrante
  if (diffDays >= 5) {
    return {
      days: diffDays,
      hoverText,
      label: `há ${diffDays} dias`,
      badgeClass: "bg-rose-950/90 text-rose-300 border border-rose-400 font-bold shadow-[0_0_8px_rgba(244,63,94,0.35)]",
      cardClass: "bg-gradient-to-br from-rose-500/35 via-rose-950/20 to-slate-950/95 border-2 border-rose-500 shadow-lg shadow-rose-500/25 text-white",
      dotColor: "bg-rose-500 shadow-[0_0_8px_#f43f5e]",
      accentText: "text-rose-400 font-bold drop-shadow-[0_0_6px_rgba(244,63,94,0.5)]",
      tooltipClass: "bg-rose-950/95 text-rose-200 border border-rose-500 shadow-rose-900/50",
    };
  }

  // 4º dia (4 dias): Laranja Forte
  if (diffDays === 4) {
    return {
      days: diffDays,
      hoverText,
      label: `há 4 dias`,
      badgeClass: "bg-orange-950/90 text-orange-300 border border-orange-400 font-bold shadow-[0_0_8px_rgba(251,146,60,0.35)]",
      cardClass: "bg-gradient-to-br from-orange-500/35 via-orange-950/20 to-slate-950/95 border-2 border-orange-400 shadow-lg shadow-orange-500/25 text-white",
      dotColor: "bg-orange-400 shadow-[0_0_8px_#fb923c]",
      accentText: "text-orange-400 font-bold drop-shadow-[0_0_6px_rgba(251,146,60,0.5)]",
      tooltipClass: "bg-orange-950/95 text-orange-200 border border-orange-400 shadow-orange-900/50",
    };
  }

  // 3º dia (3 dias): Amarelo Literal, Puro e Elétrico (#FFFF00)
  if (diffDays === 3) {
    return {
      days: diffDays,
      hoverText,
      label: `há 3 dias`,
      badgeClass: "bg-yellow-950/90 text-[#ffff00] border border-[#ffff00] font-black shadow-[0_0_8px_rgba(255,255,0,0.4)]",
      cardClass: "bg-gradient-to-br from-yellow-400/35 via-yellow-950/20 to-slate-950/95 border-2 border-[#ffff00] shadow-lg shadow-yellow-400/30 text-white",
      dotColor: "bg-[#ffff00] shadow-[0_0_8px_#ffff00]",
      accentText: "text-[#ffff00] font-black drop-shadow-[0_0_6px_rgba(255,255,0,0.5)]",
      tooltipClass: "bg-black/95 text-[#ffff00] border border-[#ffff00] shadow-[0_0_12px_rgba(255,255,0,0.3)]",
    };
  }

  // 2º dia (2 dias): Verde-Lima / Amarelado
  if (diffDays === 2) {
    return {
      days: diffDays,
      hoverText,
      label: `há 2 dias`,
      badgeClass: "bg-lime-950/90 text-lime-300 border border-lime-400 font-bold shadow-[0_0_8px_rgba(163,230,53,0.35)]",
      cardClass: "bg-gradient-to-br from-lime-500/35 via-lime-950/20 to-slate-950/95 border-2 border-lime-400 shadow-lg shadow-lime-500/25 text-white",
      dotColor: "bg-lime-400 shadow-[0_0_8px_#a3e635]",
      accentText: "text-lime-400 font-bold drop-shadow-[0_0_6px_rgba(163,230,53,0.5)]",
      tooltipClass: "bg-lime-950/95 text-lime-200 border border-lime-400 shadow-lime-900/50",
    };
  }

  // HOJE (0 d) e 1º dia (1 d): Verde Floresta Escuro Sólido
  return {
    days: diffDays,
    hoverText,
    label: diffDays === 0 ? "atualização hoje" : "há 1 dia",
    badgeClass: "bg-green-950/90 text-green-300 border border-green-600 font-bold shadow-[0_0_8px_rgba(22,163,74,0.3)]",
    cardClass: "bg-gradient-to-br from-green-600/35 via-green-950/20 to-slate-950/95 border-2 border-green-600 shadow-md shadow-green-950/50 text-white",
    dotColor: "bg-green-500 shadow-[0_0_6px_#16a34a]",
    accentText: "text-green-400 font-bold drop-shadow-[0_0_4px_rgba(34,197,94,0.4)]",
    tooltipClass: "bg-green-950/95 text-green-200 border border-green-600 shadow-green-950/50",
  };
}

function CrmDashboard() {
  const { user, loading: authLoading, role, signOut } = useAuth();
  const isAdmin = role === "admin" || (user?.email ? user.email.includes("admin") : false);
  const navigate = useNavigate();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Modal Abertura de Requisição: 'interna' ou 'externa'
  const [activeReqModal, setActiveReqModal] = useState<"interna" | "externa" | null>(null);
  const [externalSubtype, setExternalSubtype] = useState<"orcamento" | "visita_tecnica">("orcamento");
  const [newDealTitle, setNewDealTitle] = useState("");
  const [newDealCustomerId, setNewDealCustomerId] = useState("");
  const [newDealAssignedTo, setNewDealAssignedTo] = useState("");
  const [newDealDeadline, setNewDealDeadline] = useState(
    new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0]
  );
  const [newDealNotes, setNewDealNotes] = useState("");
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [inlineCompanyName, setInlineCompanyName] = useState("");
  const [inlineCustomerDoc, setInlineCustomerDoc] = useState("");
  const [inlineContactName, setInlineContactName] = useState("");
  const [inlineCustomerEmail, setInlineCustomerEmail] = useState("");
  const [inlineCustomerPhone, setInlineCustomerPhone] = useState("");

  // Filtros e busca por coluna / usuário
  const [internalFilterUser, setInternalFilterUser] = useState<string>("ME");
  const [isBoardSelectorOpen, setIsBoardSelectorOpen] = useState(false);
  const [stageSearchTerms, setStageSearchTerms] = useState<Record<string, string>>({});
  const [openSearchStageId, setOpenSearchStageId] = useState<string | null>(null);
  const [userSearchTerms, setUserSearchTerms] = useState<Record<string, string>>({});
  const [openSearchUserId, setOpenSearchUserId] = useState<string | null>(null);
  const [hoveredSubcolUser, setHoveredSubcolUser] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  // Atualização contínua a cada segundo para contagem de tempo ao vivo
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fechar barra de pesquisa e menu de visão do quadro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".crm-search-box")) {
        setOpenSearchStageId(null);
        setOpenSearchUserId(null);
      }
      if (!target.closest(".user-board-selector")) {
        setIsBoardSelectorOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Modal Detalhes e Histórico de Requisição
  const [selectedDealForHistory, setSelectedDealForHistory] = useState<Deal | null>(null);
  const [selectedCustomerForDetails, setSelectedCustomerForDetails] = useState<Customer | null>(null);
  const [isEditingCustomerCard, setIsEditingCustomerCard] = useState(false);
  const [editCustCompany, setEditCustCompany] = useState("");
  const [editCustName, setEditCustName] = useState("");
  const [editCustDoc, setEditCustDoc] = useState("");
  const [editCustEmail, setEditCustEmail] = useState("");
  const [editCustPhone, setEditCustPhone] = useState("");
  const [isSavingCustDetails, setIsSavingCustDetails] = useState(false);
  const [dealHistoryList, setDealHistoryList] = useState<DealHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [autoGeneratedLogs, setAutoGeneratedLogs] = useState<string[]>([]);
  const [stageToMove, setStageToMove] = useState<Deal["stage"] | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [isSavingUpdate, setIsSavingUpdate] = useState(false);

  // Linha do tempo unificada (histórico de movimentações + atualizações + respostas a menções + conclusões de vinculadas)
  const unifiedTimelineList = useMemo(() => {
    if (!selectedDealForHistory) return dealHistoryList;

    const replies = getDealMentionReplies(selectedDealForHistory);
    const completions = getDealSubtaskCompletions(selectedDealForHistory);

    const items: (DealHistoryItem & { isReply?: boolean; isSubtaskCompletion?: boolean; rawReplyText?: string })[] = [
      ...dealHistoryList,
    ];

    // Mescla respostas de atualizações/menções que ainda não estejam presentes no histórico
    replies.forEach((rep) => {
      const isAlreadyInHistory = items.some(
        (h) => h.id === rep.id || (h.action_type === "reply" && h.description.includes(rep.reply_text.trim()))
      );
      if (!isAlreadyInHistory) {
        items.push({
          id: rep.id,
          deal_id: rep.deal_id,
          user_name: (rep.user_name || "Usuário").toUpperCase(),
          action_type: "reply",
          description: `↩ Resposta à atualização:\n${rep.reply_text}`,
          created_at: rep.created_at,
          isReply: true,
          rawReplyText: rep.reply_text,
        });
      }
    });

    // Mescla conclusões de vinculadas
    completions.forEach((comp) => {
      const isAlreadyInHistory = items.some(
        (h) => h.id === comp.id || (h.action_type === "subtask_completed" && h.description.includes(comp.subtaskTitle))
      );
      if (!isAlreadyInHistory) {
        items.push({
          id: comp.id,
          deal_id: selectedDealForHistory.id,
          user_name: (comp.userName || "Usuário").toUpperCase(),
          action_type: "subtask_completed",
          description: `${comp.userName} concluiu a tarefa "${comp.subtaskTitle}" (Nº ${comp.reqNumber})${
            comp.completionText ? `\nAtualização de Fechamento: ${comp.completionText}` : ""
          }`,
          created_at: comp.created_at,
          isSubtaskCompletion: true,
        });
      }
    });

    // Ordenação decrescente (mais recente primeiro)
    return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [dealHistoryList, selectedDealForHistory]);

  // Helper para adicionar logs automáticos imutáveis sempre terminados com ponto final
  const appendAutoLog = (logText: string) => {
    let clean = logText.trim();
    if (!clean) return;
    if (!clean.endsWith(".")) {
      clean += ".";
    }
    setAutoGeneratedLogs((prev) => [...prev, clean]);
  };

  // Modo de Atualização: Comentário/Reatribuição, Criar Tarefa Vinculada ou Orçamento Oficial
  const [modalUpdateTab, setModalUpdateTab] = useState<"comment" | "subtask" | "quote_file">("comment");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskAssignedTo, setSubtaskAssignedTo] = useState("");
  const [subtaskDeadline, setSubtaskDeadline] = useState("");
  const [subtaskNotes, setSubtaskNotes] = useState("");
  const [isCreatingSubtask, setIsCreatingSubtask] = useState(false);
  const [isSubtaskModalOpen, setIsSubtaskModalOpen] = useState(false);
  const [isUploadingQuoteFile, setIsUploadingQuoteFile] = useState(false);
  const [isQuoteUploaderOpen, setIsQuoteUploaderOpen] = useState(false);
  const [previewingQuoteFile, setPreviewingQuoteFile] = useState<{ url: string; name: string } | null>(null);

  // Modal de Conflito de Atividade em Andamento
  const [workingConflictModal, setWorkingConflictModal] = useState<{
    previousDeal: Deal;
    targetDeal: Deal;
  } | null>(null);

  // Modal de Detalhamento das Métricas das Colunas
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);

  // Caixa de Entrada de Menções (@usuario)
  const [isMentionsInboxOpen, setIsMentionsInboxOpen] = useState(false);
  const [mentionsFilterTab, setMentionsFilterTab] = useState<"all" | "unread" | "read">("all");
  const [mentionsSearchTerm, setMentionsSearchTerm] = useState("");
  const [mentionReplyText, setMentionReplyText] = useState<Record<string, string>>({});
  const [replyingToMentionId, setReplyingToMentionId] = useState<string | null>(null);
  
  // Sugestões de @usuario no textarea de atualizações
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{ id: string; name: string }>>([]);
  const [mentionCursorIndex, setMentionCursorIndex] = useState<number | null>(null);
  const [activeMentionInputId, setActiveMentionInputId] = useState<string | null>(null);

  // Alertas de Tarefas Vinculadas Concluídas (Quantidade de conclusões não lidas no Card)
  const [unreadParentAlerts, setUnreadParentAlerts] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("mykaflow_crm_parent_alerts");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Modal de Calendário de Atividades com Prazo
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null);
  const [calendarViewDate, setCalendarViewDate] = useState<Date>(new Date());
  const [calendarUserFilter, setCalendarUserFilter] = useState<string>("ALL");

  // Controle de visualização de novas respostas/atualizações pelo responsável da atividade
  const [initialLastSeenTime, setInitialLastSeenTime] = useState<string | null>(null);

  const updateDealLastSeen = async (deal: Deal) => {
    if (!user) return;
    const nowIso = new Date().toISOString();
    const cleanNotes = (deal.notes || "").replace(/\[RESPONSIBLE_LAST_SEEN:.*?\]\s*/g, "").trim();
    const updatedNotes = `[RESPONSIBLE_LAST_SEEN:${nowIso}]\n${cleanNotes}`.trim();
    
    try {
      await supabase.from("crm_deals").update({ notes: updatedNotes }).eq("id", deal.id);
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, notes: updatedNotes } : d)));
      setSelectedDealForHistory((prev) => (prev ? { ...prev, notes: updatedNotes } : null));
    } catch (e) {
      console.warn("Erro ao atualizar visualização da atividade:", e);
    }
  };

  const getUnseenRepliesCount = (deal: Deal): number => {
    if (!user || !deal) return 0;
    const isResponsible = deal.assigned_user_id === user.id;
    const isAdmin = role === "admin";
    if (!isResponsible && !isAdmin) return 0;

    const replies = getDealMentionReplies(deal);
    const subtaskCompletions = getDealSubtaskCompletions(deal);

    // Respostas que não foram feitas pelo responsável da atividade
    const otherReplies = (Array.isArray(replies) ? replies : []).filter(
      (r) => r && r.user_id && r.user_id !== deal.assigned_user_id
    );

    // Conclusões de tarefas vinculadas não realizadas pelo próprio responsável
    const otherCompletions = (Array.isArray(subtaskCompletions) ? subtaskCompletions : []).filter(
      (c) => c && c.user_id !== deal.assigned_user_id
    );

    const totalItems = [...otherReplies, ...otherCompletions];
    if (totalItems.length === 0) return 0;

    const lastSeenStr = getResponsibleLastSeen(deal);
    if (!lastSeenStr) return totalItems.length; // todos são novos

    const lastSeenTime = new Date(lastSeenStr).getTime();
    if (isNaN(lastSeenTime)) return totalItems.length;

    return totalItems.filter((item) => item.created_at && new Date(item.created_at).getTime() > lastSeenTime).length;
  };

  const hasUnseenReplies = (deal: Deal): boolean => {
    return getUnseenRepliesCount(deal) > 0;
  };

  // State para Pulso do Card "TRABALHANDO" (Pulsando constantemente de forma suave e contínua)
  const [inProgressAlternation, setInProgressAlternation] = useState(false);
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    const scheduleNext = (shouldShow: boolean) => {
      setInProgressAlternation(shouldShow);
      timeoutId = setTimeout(() => {
        scheduleNext(!shouldShow);
      }, 1500);
    };

    scheduleNext(true);
    return () => clearTimeout(timeoutId);
  }, []);

  // Monitoramento Automático de Horário (Auto-parada forçada às 12:00 e às 17:30 para TODOS, inclusive ADM)
  useEffect(() => {
    const checkScheduleAutoStop = async () => {
      if (!user) return;
      const now = new Date();

      for (const deal of deals) {
        const activeWorker = getDealActiveWorker(deal);
        if (activeWorker && activeWorker.userId === user.id) {
          const cutoffInfo = getAutoCutoffInfo(activeWorker.startedAt, now);
          const schedule = isBusinessWorkTime(now);
          const shouldStop = cutoffInfo.shouldCutoff || (!isAdmin && !schedule.allowed);

          if (shouldStop) {
            const nowIso = new Date().toISOString();
            const cutoffTimeIso = cutoffInfo.cutoffTimeIso || nowIso;
            const startTime = new Date(activeWorker.startedAt).getTime();
            const endTime = new Date(cutoffTimeIso).getTime();
            const durationSeconds = Math.max(1, Math.floor((endTime - startTime) / 1000));
            const formatted = formatDurationHoursMinutes(durationSeconds);
            const stopReason = cutoffInfo.reason || "auto_off_hours";
            const userName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || "Usuário";

            const session: DealTimeSession = {
              id: crypto.randomUUID(),
              deal_id: deal.id,
              user_id: user.id,
              user_name: userName,
              started_at: activeWorker.startedAt,
              ended_at: cutoffTimeIso,
              duration_seconds: durationSeconds,
              stop_reason: stopReason,
            };

            // Registra para auditoria e métricas futuras
            recordActivitySessionAudit({
              dealId: deal.id,
              dealTitle: deal.title,
              userId: user.id,
              userName,
              startedAtIso: activeWorker.startedAt,
              endedAtIso: cutoffTimeIso,
              durationSeconds,
              durationFormatted: formatted,
              closeType: stopReason,
              notes: cutoffInfo.reasonLabel || "Encerramento automático por corte de expediente",
            });

            const sessionTag = `[WORK_LOG:${JSON.stringify(session)}]`;
            const cleanNotes = (deal.notes || "").replace(/\[WORK_ACTIVE:.*?\]\s*/g, "").trim();
            const updatedNotes = `${sessionTag}\n${cleanNotes}`.trim();

            try {
              await supabase.from("crm_deals").update({ notes: updatedNotes, updated_at: nowIso }).eq("id", deal.id);
              setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, notes: updatedNotes, updated_at: nowIso } : d)));
              setInterruptedActivityTitle(deal.title);
              setOffHoursInfo(schedule);
              setShowOffHoursPrompt(true);
              toast.warning(`Atividade interrompida pelo horário de corte (${cutoffInfo.reasonLabel || schedule.reason || "Fora do expediente"}).`, { duration: 6000 });
            } catch (e) {
              console.warn("Erro ao registrar parada automática:", e);
            }
          }
        }
      }
    };

    const interval = setInterval(checkScheduleAutoStop, 10000); // Checa a cada 10 segundos
    return () => clearInterval(interval);
  }, [user, deals, isAdmin]);

  // Monitoramento de Atividade: Prompt de Inatividade no Expediente vs Aviso Único Fora do Expediente
  const [showChooseActivityPrompt, setShowChooseActivityPrompt] = useState(false);
  const [showOffHoursPrompt, setShowOffHoursPrompt] = useState(false);
  const [offHoursInfo, setOffHoursInfo] = useState<WorkScheduleInfo | null>(null);
  const [interruptedActivityTitle, setInterruptedActivityTitle] = useState<string | null>(null);
  const lastPromptTimeRef = useRef<number>(Date.now());
  const previousScheduleAllowedRef = useRef<boolean | null>(null);
  const offHoursPromptShownForCurrentPeriodRef = useRef<boolean>(false);

  // Saudação dinâmica conforme o horário do dia
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours >= 5 && hours < 12) return "Bom dia";
    if (hours >= 12 && hours < 18) return "Boa tarde";
    return "Boa noite";
  };

  useEffect(() => {
    if (!user || loading) return;

    const checkScheduleAndActivity = () => {
      const schedule = isBusinessWorkTime();

      // 1. FORA DO EXPEDIENTE (Noite, Almoço, Fim de Semana, Feriados)
      if (!schedule.allowed) {
        setShowChooseActivityPrompt(false);

        // Se acabou de transicionar para fora do expediente ou é a primeira checagem
        if (previousScheduleAllowedRef.current !== false) {
          previousScheduleAllowedRef.current = false;
        }

        // Chave de período para garantir que só alerte uma única vez neste período/sessão
        const periodType = schedule.isLunch ? "lunch" : schedule.isWeekend ? "weekend" : schedule.isHoliday ? "holiday" : "off_hours";
        const todayStr = new Date().toISOString().split("T")[0];
        const periodKey = `mykaflow_offhours_prompt_${todayStr}_${periodType}_${user.id}`;
        const alreadyPromptedInSession = sessionStorage.getItem(periodKey) === "true";

        // Exibe apenas UMA vez para este período de fora de expediente
        if (!offHoursPromptShownForCurrentPeriodRef.current && !alreadyPromptedInSession) {
          offHoursPromptShownForCurrentPeriodRef.current = true;
          sessionStorage.setItem(periodKey, "true");
          setOffHoursInfo(schedule);
          setShowOffHoursPrompt(true);
        }
        return; // Fora do expediente NUNCA repete de 5 em 5 minutos!
      }

      // 2. DENTRO DO EXPEDIENTE DE TRABALHO (07h30 às 12h00 e 13h00 às 17h30)
      setShowOffHoursPrompt(false);

      // Se acabou de transicionar de fora do expediente para o expediente (ex: almoço terminou às 13h00)
      const justEnteredWorkHours = previousScheduleAllowedRef.current === false;
      const isFirstCheck = previousScheduleAllowedRef.current === null;
      previousScheduleAllowedRef.current = true;
      offHoursPromptShownForCurrentPeriodRef.current = false;

      const isWorkingNow = deals.some((d) => {
        const active = getDealActiveWorker(d);
        return Boolean(active && active.userId === user.id);
      });

      if (isWorkingNow) {
        lastPromptTimeRef.current = Date.now();
        setShowChooseActivityPrompt(false);
        return;
      }

      // Se acabou de entrar no expediente (ou primeiro acesso no expediente) e não tem atividade ativa:
      if (isFirstCheck || justEnteredWorkHours) {
        lastPromptTimeRef.current = Date.now();
        setShowChooseActivityPrompt(true);
        return;
      }

      // Registra 5 segundos de inatividade durante o expediente para auditoria
      const currentUserName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || "Usuário";
      recordInactivitySeconds(user.id, currentUserName, 5);

      // Se já se passaram 5 minutos sem iniciar atividade, alerta novamente
      const elapsed = Date.now() - lastPromptTimeRef.current;
      if (elapsed >= 5 * 60 * 1000) {
        lastPromptTimeRef.current = Date.now();
        setShowChooseActivityPrompt(true);
      }
    };

    // Executa checagem imediata
    checkScheduleAndActivity();

    // Mantém avaliação contínua a cada 5 segundos (detecta automaticamente a virada das 13h00 sem precisar de reload)
    const interval = setInterval(checkScheduleAndActivity, 5000);
    return () => clearInterval(interval);
  }, [user, deals, loading]);

  const handleDismissActivityPrompt = () => {
    // Ao fechar o prompt de atividade em expediente, reinicia a contagem dos próximos 5 minutos
    lastPromptTimeRef.current = Date.now();
    setShowChooseActivityPrompt(false);
  };

  const handleDismissOffHoursPrompt = () => {
    // Fecha o aviso único de fora de expediente e não exibe mais durante este período
    setShowOffHoursPrompt(false);
    setInterruptedActivityTitle(null);
  };

  const saveParentAlerts = (newAlerts: Record<string, number>) => {
    setUnreadParentAlerts(newAlerts);
    try {
      localStorage.setItem("mykaflow_crm_parent_alerts", JSON.stringify(newAlerts));
    } catch (e) {
      console.warn("Erro ao salvar alertas:", e);
    }
  };

  const handleMarkAlertAsSeen = (dealId: string) => {
    const updated = { ...unreadParentAlerts };
    delete updated[dealId];
    saveParentAlerts(updated);
  };

  // Edição de Prazo pelo Administrador
  const [adminEditDeadline, setAdminEditDeadline] = useState<string>("");
  const [isEditingDeadline, setIsEditingDeadline] = useState<boolean>(false);
  const [isSavingDeadline, setIsSavingDeadline] = useState<boolean>(false);

  // Edição de Título pelo Autor da Atividade ou Administrador
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editingTitleValue, setEditingTitleValue] = useState<string>("");
  const [isSavingTitle, setIsSavingTitle] = useState<boolean>(false);

  // Edição de Cliente pelo Administrador
  const [isEditingCustomer, setIsEditingCustomer] = useState<boolean>(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string>("");
  const [editingCustomerSearch, setEditingCustomerSearch] = useState<string>("");

  // Central de Alertas ADM (Prazos ultrapassados e Devoluções aos criadores)
  const [isAdminAlertsOpen, setIsAdminAlertsOpen] = useState(false);
  const [returnedHistoryList, setReturnedHistoryList] = useState<any[]>([]);

  // Isolamento de Coluna / Tipo de Requisição na Tela
  const [isolatedStageId, setIsolatedStageId] = useState<string | null>(null);

  // Hover de Topo de Coluna para Duração Média (ocupa o 1º card abaixo do cabeçalho)
  const [hoveredStageHeaderId, setHoveredStageHeaderId] = useState<string | null>(null);
  const [hoveredUserSubcolId, setHoveredUserSubcolId] = useState<string | null>(null);

  // Movimentação Manual Drag and Drop entre Etapas e Reordenação de Prioridade
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [dragOverTargetDealId, setDragOverTargetDealId] = useState<string | null>(null);
  const [dragDropPosition, setDragDropPosition] = useState<"before" | "after">("before");
  const quoteFileInputRef = useRef<HTMLInputElement | null>(null);
  const isDraggingRef = useRef(false);
  const draggingDealIdRef = useRef<string | null>(null);
  const modalBackdropMouseDownRef = useRef<boolean>(false);

  const handleCloseSelectedDealModal = () => {
    if (newComment.trim()) {
      if (window.confirm("Você possui um texto digitado na atualização que ainda não foi gravado. Deseja realmente fechar e descartar o texto?")) {
        setSelectedDealForHistory(null);
        setIsTimelineOpen(false);
        setNewComment("");
        setAutoGeneratedLogs([]);
      }
      return;
    }
    setSelectedDealForHistory(null);
    setIsTimelineOpen(false);
    setNewComment("");
    setAutoGeneratedLogs([]);
  };

  // Ordenação de prioridade personalizada por coluna (persistido localmente para o usuário)
  const [stageCustomOrders, setStageCustomOrders] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem("mykaflow_crm_stage_order");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Colunas Recolhidas em Abas Estreitas
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});
  const [userInitializedStages, setUserInitializedStages] = useState(false);

  // Controle de recolhimento / expansão de tarefas vinculadas no Kanban (via clique ou hover)
  const [expandedSubtaskDealIds, setExpandedSubtaskDealIds] = useState<Record<string, boolean>>({});
  const [hoveredSubtasksDealId, setHoveredSubtasksDealId] = useState<string | null>(null);

  const toggleSubtasks = (dealId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedSubtaskDealIds((prev) => ({
      ...prev,
      [dealId]: !prev[dealId],
    }));
  };

  // Modal de Atualização Obrigatória ao Mover de Coluna / Etapa
  const [movingDealState, setMovingDealState] = useState<{
    deal: Deal;
    targetStage: Deal["stage"];
    updateText: string;
    updatedNotes: string;
    reassignTo: string;
  } | null>(null);
  const [isSavingMove, setIsSavingMove] = useState(false);

  // Modal Fechar Contrato / Integração Fluxo de Caixa
  const [contractModalDeal, setContractModalDeal] = useState<Deal | null>(null);
  const [contractInstallments, setContractInstallments] = useState(1);
  const [contractStartDate, setContractStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal / Gaveta de Requisições Internas Arquivadas
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);
  const [archivedSearchTerm, setArchivedSearchTerm] = useState("");
  const [archivedFilterStage, setArchivedFilterStage] = useState<"lead" | "completed" | "lost" | "ALL">("ALL");
  const [archivedPeriodFilter, setArchivedPeriodFilter] = useState<"ALL" | "today" | "week" | "month" | "custom">("ALL");
  const [archivedCustomDate, setArchivedCustomDate] = useState<string>("");

  // Menu Lateral Flutuante / Off-Canvas
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);

  const handleExit = async () => {
    setIsSideMenuOpen(false);
    if (role === "admin") {
      navigate({ to: "/" });
    } else {
      await signOut();
      navigate({ to: "/login" });
    }
  };

  // Alternar filtro rápido por usuário clicável
  function handleToggleUserFilter(userId?: string | null, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    if (!userId) return;
    setIsolatedStageId(null);
    setSelectedDealForHistory(null);
    setInternalFilterUser((prev) => (prev === userId ? "ALL" : userId));
  }

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [user, authLoading, navigate]);

  // Listener Global da tecla ESC para fechar qualquer modal, gaveta, formulário ou card aberto
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Se houver preview de arquivo ou modal específico aberto no topo, fecha o mais específico primeiro
        if (showChooseActivityPrompt) {
          handleDismissActivityPrompt();
          return;
        }
        if (previewingQuoteFile) {
          setPreviewingQuoteFile(null);
          return;
        }
        if (isQuoteUploaderOpen) {
          setIsQuoteUploaderOpen(false);
          return;
        }
        if (isSubtaskModalOpen) {
          setIsSubtaskModalOpen(false);
          return;
        }
        if (isNewCustomerModalOpen) {
          setIsNewCustomerModalOpen(false);
          return;
        }
        if (selectedCustomerForDetails) {
          setSelectedCustomerForDetails(null);
          return;
        }
        if (isEditingTitle) {
          setIsEditingTitle(false);
          return;
        }
        if (isEditingDeadline) {
          setIsEditingDeadline(false);
          return;
        }
        if (isTimelineOpen) {
          setIsTimelineOpen(false);
          return;
        }
        if (activeReqModal) {
          setActiveReqModal(null);
          return;
        }
        if (movingDealState) {
          setMovingDealState(null);
          return;
        }
        if (contractModalDeal) {
          setContractModalDeal(null);
          return;
        }
        if (isAdminAlertsOpen) {
          setIsAdminAlertsOpen(false);
          return;
        }
        if (isArchivedModalOpen) {
          setIsArchivedModalOpen(false);
          return;
        }
        if (isSideMenuOpen) {
          setIsSideMenuOpen(false);
          return;
        }
        if (isProfileOpen) {
          setIsProfileOpen(false);
          return;
        }
        if (selectedDealForHistory) {
          const activeTag = document.activeElement?.tagName?.toLowerCase();
          if (activeTag === "textarea" || activeTag === "input") {
            return;
          }
          if (newComment.trim()) {
            if (window.confirm("Você possui um texto digitado na atualização. Deseja realmente fechar e descartar o texto?")) {
              setSelectedDealForHistory(null);
              setIsTimelineOpen(false);
              setNewComment("");
              setAutoGeneratedLogs([]);
            }
            return;
          }
          setSelectedDealForHistory(null);
          setIsTimelineOpen(false);
          return;
        }
        if (isolatedStageId) {
          setIsolatedStageId(null);
          return;
        }
        if (openSearchStageId || openSearchUserId) {
          setOpenSearchStageId(null);
          setOpenSearchUserId(null);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    previewingQuoteFile,
    isQuoteUploaderOpen,
    isSubtaskModalOpen,
    isNewCustomerModalOpen,
    selectedCustomerForDetails,
    isEditingTitle,
    isEditingDeadline,
    isTimelineOpen,
    activeReqModal,
    movingDealState,
    contractModalDeal,
    isAdminAlertsOpen,
    isArchivedModalOpen,
    isSideMenuOpen,
    isProfileOpen,
    selectedDealForHistory,
    newComment,
    isolatedStageId,
    openSearchStageId,
    openSearchUserId,
  ]);

  async function loadCrmData() {
    setLoading(true);
    try {
      const { data: custData } = await supabase
        .from("crm_customers")
        .select("*")
        .order("name");

      const { data: profsData } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .order("display_name");

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const roleMap = new Map((rolesData || []).map((r: any) => [r.user_id, r.role]));

      const { data: dealsData } = await supabase
        .from("crm_deals")
        .select("*, crm_customers(name)")
        .order("updated_at", { ascending: false });

      // Busca histórico recente para obter o autor e a data da última atualização real de cada atividade
      let historyMap = new Map<string, string>();
      let historyDateMap = new Map<string, string>();
      try {
        const { data: recentHistory } = await supabase
          .from("crm_deal_history")
          .select("deal_id, user_name, created_at")
          .order("created_at", { ascending: false })
          .limit(1000);

        if (recentHistory) {
          recentHistory.forEach((h: any) => {
            if (h.deal_id) {
              if (h.user_name && !historyMap.has(h.deal_id)) {
                historyMap.set(h.deal_id, h.user_name);
              }
              if (h.created_at && !historyDateMap.has(h.deal_id)) {
                historyDateMap.set(h.deal_id, h.created_at);
              }
            }
          });
        }
      } catch (hErr) {
        console.warn("Aviso ao buscar histórico para autores de atualização:", hErr);
      }

      if (custData) setCustomers(custData);
      if (profsData) {
        setTeamMembers(
          profsData.map((p) => ({
            ...p,
            role: roleMap.get(p.id) || "user",
            display_name: p.display_name ? p.display_name.toUpperCase() : p.display_name,
          }))
        );
      }
      if (dealsData) {
        const mappedDeals: Deal[] = dealsData.map((d: any) => {
          const creatorProf = profsData?.find((p) => p.id === d.user_id);
          const mappedStage = d.stage === "proposal" ? "negotiation" : d.stage;
          const creatorName = getFirstName(
            creatorProf?.display_name ||
            creatorProf?.email ||
            (d.user_id === user?.id
              ? user?.user_metadata?.display_name || user?.email || "Você"
              : "Autor")
          );
          const rawLatestAuthor = historyMap.get(d.id);
          const latestAuthor = getFirstName(rawLatestAuthor || creatorName);
          const assignedProf = profsData?.find((p) => p.id === d.assigned_user_id);
          const assignedName = getFirstName(
            assignedProf?.display_name ||
            assignedProf?.email ||
            "Não atribuído"
          );

          const latestRealDate = historyDateMap.get(d.id) || d.created_at;

          return {
            ...d,
            stage: mappedStage,
            customer_name:
              d.crm_customers?.company_name ||
              d.crm_customers?.name ||
              "Uso Interno / Empresa",
            creator_name: creatorName,
            latest_update_author: latestAuthor,
            latest_update_at: latestRealDate,
            assigned_user_name: assignedName,
          };
        });

        // Sincroniza e corrige automaticamente o stage de todas as tarefas vinculadas existentes
        // para que fiquem exatamente na mesma coluna da atividade mãe
        const syncedDeals = mappedDeals.map((deal) => {
          if (!deal.notes || !deal.title.includes("[TAREFA]")) return deal;

          let parentId: string | null = null;
          let parentReq: string | null = null;

          if (deal.notes.includes("[PARENT_DEAL:")) {
            const data = extractParentDealData(deal.notes);
            if (data) {
              parentId = data.parentId;
              parentReq = data.parentReq;
            }
          }
          if (!parentId) {
            const match = deal.notes.match(/(?:Tarefa|Atividade)\s*vinculada\s*a:\s*(.*?)\s*\(Nº\s*([0-9.]+)\)/i);
            if (match) {
              parentReq = match[2].trim();
            }
          }

          if (parentId || parentReq) {
            const parent = mappedDeals.find(
              (p) => (parentId && p.id === parentId) || (parentReq && getDealReqNumber(p, mappedDeals) === parentReq)
            );
            if (parent && parent.stage && parent.stage !== deal.stage) {
              // Atualiza no banco de dados para persistir a correção
              supabase
                .from("crm_deals")
                .update({ stage: parent.stage })
                .eq("id", deal.id)
                .then();

              return {
                ...deal,
                stage: parent.stage,
              };
            }
          }

          return deal;
        });

        setDeals(syncedDeals);
      }

      // Busca histórico de devoluções para alerta dos administradores
      try {
        const { data: retHistory } = await supabase
          .from("crm_deal_history")
          .select("*")
          .eq("action_type", "returned_to_creator")
          .order("created_at", { ascending: false })
          .limit(30);

        if (retHistory) setReturnedHistoryList(retHistory);
      } catch (historyErr) {
        // silencioso
      }
    } catch (err: any) {
      console.error("Erro ao carregar dados do CRM:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadCrmData();
    }
  }, [user]);

  function openNewRequestModal(type: "interna" | "externa") {
    setActiveReqModal(type);
    setNewDealTitle("");
    setNewDealCustomerId("");
    setNewDealAssignedTo("");
    setNewDealNotes("");
    setIsNewCustomerModalOpen(false);
    setInlineCompanyName("");
    setInlineCustomerDoc("");
    setInlineContactName("");
    setInlineCustomerEmail("");
    setInlineCustomerPhone("");
    setNewDealDeadline(
      type === "interna"
        ? new Date(Date.now() + 86400000 * 2).toISOString().split("T")[0]
        : ""
    );
  }

  // Extração defensiva e à prova de falhas de metadados PARENT_DEAL
  const extractParentDealData = (notes: string | undefined | null) => {
    if (!notes || !notes.includes("[PARENT_DEAL:")) return null;
    try {
      const startIdx = notes.indexOf("[PARENT_DEAL:");
      if (startIdx === -1) return null;
      const jsonStart = startIdx + "[PARENT_DEAL:".length;
      const endIdx = notes.indexOf("}]", jsonStart);
      if (endIdx !== -1) {
        const jsonStr = notes.substring(jsonStart, endIdx + 1);
        return JSON.parse(jsonStr);
      }
      const match = notes.match(/\[PARENT_DEAL:(\{.*?\})\]/s) || notes.match(/\[PARENT_DEAL:(.*?)\]/s);
      if (match && match[1]) {
        return JSON.parse(match[1]);
      }
    } catch {}
    return null;
  };

  // Helper para identificar vínculo de atividade primária
  const getParentDealInfo = (deal: Deal | null) => {
    if (!deal || !deal.notes) return null;

    // 1. Tag [PARENT_DEAL:{...}]
    if (deal.notes.includes("[PARENT_DEAL:")) {
      const data = extractParentDealData(deal.notes);
      if (data && data.parentId) {
        const found = deals.find((d) => d.id === data.parentId);
        return {
          id: data.parentId,
          title: data.parentTitle,
          reqNumber: data.parentReq,
          deal: found,
        };
      }
    }

    // 2. Regex nos notes: Tarefa/Atividade vinculada a: ... (Nº ...)
    const match = deal.notes.match(/(?:Tarefa|Atividade)\s*vinculada\s*a:\s*(.*?)\s*\(Nº\s*([0-9.]+)\)/i);
    if (match) {
      const title = match[1].trim();
      const reqNumber = match[2].trim();
      const found = deals.find((d) => getDealReqNumber(d, deals) === reqNumber);
      return {
        id: found?.id || "",
        title: found?.title || title,
        reqNumber,
        deal: found,
      };
    }

    return null;
  };

  // Helper para obter atividades arquivadas pertencentes a uma coluna específica (Tarefas, Concluídos, Perdidos)
  const getArchivedDealsForStage = (stageId: "lead" | "completed" | "lost", allDeals: Deal[]) => {
    return allDeals.filter((d) => {
      if (d.stage !== "archived") return false;
      if (getParentDealInfo(d)) return false;
      return getArchivedOriginStage(d) === stageId;
    });
  };

  // Helper para obter o cliente de um deal (incluindo herança de atividade primária)
  const getDealCustomer = (deal: Deal | null): Customer | null => {
    if (!deal) return null;
    if (deal.customer_id) {
      const found = customers.find((c) => c.id === deal.customer_id);
      if (found) return found;
    }
    if (deal.customer_name && deal.customer_name !== "Uso Interno / Empresa") {
      const found = customers.find(
        (c) =>
          c.company_name?.toUpperCase() === deal.customer_name?.toUpperCase() ||
          c.name?.toUpperCase() === deal.customer_name?.toUpperCase()
      );
      if (found) return found;
    }
    const parentInfo = getParentDealInfo(deal);
    if (parentInfo?.deal) {
      return getDealCustomer(parentInfo.deal);
    }
    return null;
  };

  // Helper para limpar e formatar notas para exibição no hover do card
  const getCleanHoverNote = (notes?: string | null, authorFallback?: string) => {
    if (!notes) return { author: (authorFallback || "Usuário").toUpperCase(), text: "Sem atualizações registradas." };

    // Se houver notificação de conclusão pendente de aceite, usa as notas do responsável que concluiu
    const completionMatch = notes.match(/\[TASK_COMPLETION_NOTIFICATION:(.*?)\]/);
    let completionAuthor: string | null = null;
    let completionText: string | null = null;
    if (completionMatch) {
      try {
        const parsed = JSON.parse(completionMatch[1]);
        if (parsed.status === "pending_acceptance") {
          completionAuthor = parsed.concluded_by_user_name || parsed.concludedByUserName;
          completionText = parsed.completion_notes || parsed.completionNotes;
        }
      } catch {}
    }

    let clean = notes
      .replace(/<!--.*?-->\s*/g, "")
      .replace(/\[TASK_COMPLETION_NOTIFICATION:.*?\]\s*/g, "")
      .replace(/\[WORK_ACTIVE:.*?\]\s*/g, "")
      .replace(/\[WORK_LOG:.*?\]\s*/g, "")
      .replace(/\[QUOTE_DATA:.*?\]\s*/g, "")
      .replace(/\[PARENT_DEAL:.*?\]\s*/g, "")
      .replace(/\[QUOTE_FILE:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_LINK:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_COMPLETED:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_COMPLETION:.*?\]\s*/g, "")
      .replace(/\[DEVOLVIDA\]\s*/g, "")
      .replace(/\[HISTÓRICO_.*?:.*?\]\s*/g, "")
      .replace(/\[MENTION:.*?\]\s*/g, "")
      .replace(/\[MENTION_REPLY:.*?\]\s*/g, "")
      .replace(/\[RESPONSIBLE_LAST_SEEN:.*?\]\s*/g, "")
      .trim();

    if (!clean && completionText) {
      clean = completionText;
      if (completionAuthor) {
        authorFallback = completionAuthor;
      }
    }

    if (!clean) return { author: (authorFallback || "Usuário").toUpperCase(), text: "Sem atualizações registradas." };

    // Se começar com [Nome]: já possui autor embutido; caso comece com Instruções:, remove o prefixo
    if (clean.toLowerCase().startsWith("instruções:")) {
      clean = clean.replace(/^instruções:\s*/i, "").trim();
    }

    // Se já tiver formato [AUTOR]: no início do texto, resolve com o cadastro oficial de usuários
    const authorMatch = clean.match(/^\[([A-Za-z0-9À-ÿ\s._-]+)\]:\s*(.*)$/s);
    if (authorMatch) {
      const parsedAuthor = authorMatch[1].trim();
      const matchedMember = teamMembers.find(
        (m) =>
          m.display_name?.toUpperCase() === parsedAuthor.toUpperCase() ||
          m.email?.toUpperCase() === parsedAuthor.toUpperCase() ||
          m.display_name?.toUpperCase().startsWith(parsedAuthor.toUpperCase().split(" ")[0]) ||
          parsedAuthor.toUpperCase().startsWith(m.display_name?.toUpperCase() || "###")
      );

      const finalAuthorName = matchedMember?.display_name || parsedAuthor;

      return {
        author: finalAuthorName.toUpperCase(),
        text: authorMatch[2].trim(),
      };
    }

    const matchedFallback = teamMembers.find(
      (m) =>
        m.display_name?.toUpperCase() === authorFallback?.toUpperCase() ||
        m.email?.toUpperCase() === authorFallback?.toUpperCase() ||
        m.display_name?.toUpperCase().startsWith(authorFallback?.toUpperCase().split(" ")[0] || "###") ||
        authorFallback?.toUpperCase().startsWith(m.display_name?.toUpperCase() || "###")
    );

    const finalFallbackName = matchedFallback?.display_name || authorFallback || "Usuário";

    return {
      author: finalFallbackName.toUpperCase(),
      text: clean,
    };
  };

  // Helper para verificar se a atividade é relevante para o usuário selecionado no filtro:
  // - Se estiver aguardando aceite: aparece tanto para o AUTOR (que deve aceitar) quanto para o RESPONSÁVEL (que armazenou)
  // - Se estiver em andamento: aparece apenas para o RESPONSÁVEL
  const isDealUserMatching = (deal: Deal, targetUserId: string | null | undefined): boolean => {
    if (!targetUserId || targetUserId === "ALL") return true;
    if (targetUserId === "unassigned") return !deal.assigned_user_id;
    if (isDealPendingAuthorAcceptance(deal)) {
      return deal.user_id === targetUserId || deal.assigned_user_id === targetUserId;
    }
    return deal.assigned_user_id === targetUserId;
  };

  const getDealEffectiveUserId = (deal: Deal): string | null => {
    if (isDealPendingAuthorAcceptance(deal)) {
      return deal.user_id || deal.assigned_user_id || null;
    }
    return deal.assigned_user_id || null;
  };

  // Helper para formatar @menções em texto com destaque visual padronizado (branco, caixa alta, com @) e torná-las clicáveis
  const formatMentionsInText = (text: string) => {
    if (!text) return "";
    const parts = text.split(/(@[A-Za-z0-9À-ÿ._-]+)/g);
    return parts.map((part, pIdx) => {
      if (part.startsWith("@")) {
        const namePart = part.slice(1);
        // Tenta encontrar o membro correspondente na equipe
        const matchedMember = teamMembers.find((m) => {
          const mName = m.display_name || m.email || "";
          const firstName = mName.split(" ")[0];
          return (
            mName.toUpperCase() === namePart.toUpperCase() ||
            firstName.toUpperCase() === namePart.toUpperCase() ||
            (m.email && m.email.toUpperCase() === namePart.toUpperCase())
          );
        });

        if (matchedMember) {
          const displayName = matchedMember.display_name || matchedMember.email || namePart;
          return (
            <button
              key={pIdx}
              type="button"
              onClick={(e) => handleToggleUserFilter(matchedMember.id, e)}
              className="text-white font-bold hover:underline cursor-pointer transition-colors bg-transparent border-none p-0 inline align-baseline uppercase"
              title={`Ver atividades de ${displayName}`}
            >
              @{displayName.toUpperCase()}
            </button>
          );
        }

        return (
          <span key={pIdx} className="text-white font-bold uppercase">
            @{namePart.toUpperCase()}
          </span>
        );
      }
      return part;
    });
  };

  // Helper para selecionar menção nas sugestões e inserir no campo correspondente
  const handleSelectMention = (member: { id: string; name: string }) => {
    if (mentionCursorIndex === null) return;
    const mentionName = member.name.split(" ")[0]; // Primeiro nome para menção amigável

    if (activeMentionInputId && activeMentionInputId !== "new_comment") {
      const currentText = mentionReplyText[activeMentionInputId] || "";
      const before = currentText.slice(0, mentionCursorIndex);
      const after = currentText.slice(currentText.indexOf(" ", mentionCursorIndex) === -1 ? currentText.length : currentText.indexOf(" ", mentionCursorIndex));
      const updatedText = `${before}@${mentionName} ${after.startsWith(" ") ? after.slice(1) : after}`;
      
      setMentionReplyText((prev) => ({
        ...prev,
        [activeMentionInputId]: updatedText,
      }));
    } else {
      const before = newComment.slice(0, mentionCursorIndex);
      const after = newComment.slice(newComment.indexOf(" ", mentionCursorIndex) === -1 ? newComment.length : newComment.indexOf(" ", mentionCursorIndex));
      const updatedText = `${before}@${mentionName} ${after.startsWith(" ") ? after.slice(1) : after}`;
      setNewComment(updatedText);
    }
    setMentionSuggestions([]);
    setMentionCursorIndex(null);
    setActiveMentionInputId(null);
  };

  // Helper unificado para renderizar descrições com botões clicáveis (criação e conclusão de tarefas)
  const renderInteractiveDescription = (rawText: string) => {
    if (!rawText) return null;
    const sanitized = rawText
      .replace(/<!--.*?-->\s*/g, "")
      .replace(/\[TASK_COMPLETION_NOTIFICATION:.*?\]\s*/g, "")
      .replace(/\[WORK_ACTIVE:.*?\]\s*/g, "")
      .replace(/\[WORK_LOG:.*?\]\s*/g, "")
      .replace(/\[QUOTE_DATA:.*?\]\s*/g, "")
      .replace(/\[PARENT_DEAL:.*?\]\s*/g, "")
      .replace(/\[QUOTE_FILE:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_LINK:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_COMPLETED:.*?\]\s*/g, "")
      .replace(/\[SUBTASK_COMPLETION:.*?\]\s*/g, "")
      .replace(/\[DEVOLVIDA\]\s*/g, "")
      .replace(/\[HISTÓRICO_.*?:.*?\]\s*/g, "")
      .replace(/\[MENTION:.*?\]\s*/g, "")
      .replace(/\[MENTION_REPLY:.*?\]\s*/g, "")
      .replace(/\[RESPONSIBLE_LAST_SEEN:.*?\]\s*/g, "")
      .trim();

    if (!sanitized) return null;

    const lines = sanitized.split("\n");

    return (
      <div className="space-y-1 pt-0.5">
        {lines.map((line, lineIdx) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return <div key={lineIdx} className="h-1" />;

          // 1. Criação de Tarefa Vinculada
          const createMatch = trimmedLine.match(/^([A-Za-z0-9À-ÿ\s._-]+?)\s+criou a tarefa\s+"([^"]+)"\s+para o\s+([A-Za-z0-9À-ÿ\s._-]+)$/i);
          if (createMatch) {
            const creatorName = createMatch[1].trim();
            const subtaskTitle = createMatch[2].trim();
            const assignedName = createMatch[3].trim();

            const creatorUser = teamMembers.find(
              (m) =>
                m.display_name?.toUpperCase() === creatorName.toUpperCase() ||
                m.email?.toUpperCase() === creatorName.toUpperCase()
            );
            const assignedUser = teamMembers.find(
              (m) =>
                m.display_name?.toUpperCase() === assignedName.toUpperCase() ||
                m.email?.toUpperCase() === assignedName.toUpperCase()
            );
            const matchedDeal = deals.find(
              (d) =>
                d.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "").trim().toUpperCase() === subtaskTitle.toUpperCase() ||
                d.title.toUpperCase().includes(subtaskTitle.toUpperCase())
            );

            return (
              <div
                key={lineIdx}
                className="flex flex-wrap items-center gap-1.5 text-xs text-white/90 py-1 pl-3 border-l-2 border-emerald-400 my-1"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleUserFilter(creatorUser?.id || null, e);
                  }}
                  className="font-bold text-white hover:underline cursor-pointer uppercase"
                  title={`Filtrar por ${creatorName}`}
                >
                  {creatorName}
                </button>
                <span className="text-white/80">criou a tarefa</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (matchedDeal) {
                      openDealHistory(matchedDeal);
                    } else {
                      toast.info(`Tarefa: ${subtaskTitle}`);
                    }
                  }}
                  className="font-black text-emerald-300 hover:text-white hover:underline inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 px-2 py-0.5 rounded-md cursor-pointer shadow-sm transition-all"
                  title="Clique para abrir esta tarefa"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{subtaskTitle}</span>
                </button>
                <span className="text-white/80">para o</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleUserFilter(assignedUser?.id || null, e);
                  }}
                  className="font-bold text-white hover:underline cursor-pointer uppercase"
                  title={`Filtrar por ${assignedName}`}
                >
                  {assignedName}
                </button>
              </div>
            );
          }

          // 2. Conclusão de Tarefa Vinculada
          const completeMatch = trimmedLine.match(/^([A-Za-z0-9À-ÿ\s._-]+?)\s+concluiu a tarefa\s+"([^"]+)"(.*)$/i);
          if (completeMatch) {
            const userName = completeMatch[1].trim();
            const subtaskTitle = completeMatch[2].trim();
            const extraNotes = completeMatch[3] ? completeMatch[3].trim() : "";

            const userObj = teamMembers.find(
              (m) =>
                m.display_name?.toUpperCase() === userName.toUpperCase() ||
                m.email?.toUpperCase() === userName.toUpperCase()
            );
            const matchedDeal = deals.find(
              (d) =>
                d.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "").trim().toUpperCase() === subtaskTitle.toUpperCase() ||
                d.title.toUpperCase().includes(subtaskTitle.toUpperCase())
            );

            return (
              <div
                key={lineIdx}
                className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-300 py-1 pl-3 border-l-2 border-emerald-500 my-1"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleUserFilter(userObj?.id || null, e);
                  }}
                  className="font-bold text-white hover:underline cursor-pointer uppercase"
                  title={`Filtrar por ${userName}`}
                >
                  {userName}
                </button>
                <span className="text-emerald-100/90">concluiu a tarefa</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (matchedDeal) {
                      openDealHistory(matchedDeal);
                    } else {
                      toast.info(`Tarefa: ${subtaskTitle}`);
                    }
                  }}
                  className="font-black text-emerald-200 hover:text-white hover:underline inline-flex items-center gap-1.5 bg-emerald-500/30 hover:bg-emerald-500/40 border border-emerald-400/50 px-2 py-0.5 rounded-md cursor-pointer shadow-sm transition-all"
                  title="Clique para abrir esta tarefa"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{subtaskTitle}</span>
                </button>
                {extraNotes && <span className="text-white/80 text-xs ml-1">{extraNotes}</span>}
              </div>
            );
          }

          // 3. Orçamento Oficial Anexado na Linha do Tempo
          const quoteDocMatch = trimmedLine.match(/^(\[QUOTE_DOC:.*?\]\s*)?([A-Za-z0-9À-ÿ\s._-]+?)\s+anexou o documento de orçamento oficial\s+"([^"]+)"\s*(?:\(([^)]+)\))?.*$/i);
          if (quoteDocMatch || trimmedLine.includes("[QUOTE_DOC:")) {
            let docUrl = "";
            let fileName = "orcamento_oficial";
            let fileSize = "";
            let userName = "Usuário";

            if (trimmedLine.includes("[QUOTE_DOC:")) {
              try {
                const jsonStr = trimmedLine.match(/\[QUOTE_DOC:(.*?)\]/)?.[1];
                if (jsonStr) {
                  const parsed = JSON.parse(jsonStr);
                  docUrl = parsed.url;
                  fileName = parsed.name || fileName;
                  fileSize = parsed.sizeKb ? `${parsed.sizeKb} KB` : "";
                }
              } catch (e) {}
            }

            if (quoteDocMatch) {
              userName = quoteDocMatch[2]?.trim() || userName;
              fileName = quoteDocMatch[3]?.trim() || fileName;
              if (quoteDocMatch[4]) fileSize = quoteDocMatch[4].trim();
            }

            const currentDoc = getDealQuoteFile(selectedDealForHistory, dealHistoryList);
            const finalUrl = docUrl || currentDoc?.url;

            return (
              <div
                key={lineIdx}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border border-emerald-500/40 my-1 shadow-sm"
              >
                <div className="flex items-center gap-2.5 text-xs">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                    <FileCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-white uppercase">{userName}</span>
                    <span className="text-emerald-200/90 ml-1 font-semibold">anexou o Orçamento Oficial</span>
                    <p className="font-mono text-[11px] text-emerald-300 font-bold mt-0.5 truncate max-w-[260px]">
                      {fileName} {fileSize ? `(${fileSize})` : ""}
                    </p>
                  </div>
                </div>

                {finalUrl && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewingQuoteFile({ url: finalUrl, name: fileName });
                    }}
                    className="btn-futuristic px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow cursor-pointer shrink-0 ml-auto"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Visualizar</span>
                  </button>
                )}
              </div>
            );
          }

          // 4. Substituição amigável de qualquer linha legada "Instruções: "
          if (trimmedLine.toLowerCase().startsWith("instruções:")) {
            const cleanInstruction = trimmedLine.replace(/^instruções:\s*/i, "").trim();
            const authorName = selectedDealForHistory?.creator_name || selectedDealForHistory?.latest_update_author || "Autor";
            return (
              <p key={lineIdx} className="text-white/90 text-xs whitespace-pre-wrap leading-relaxed">
                <strong className="text-sky-300 font-bold">[{authorName}]: </strong>
                {cleanInstruction}
              </p>
            );
          }


          return (
            <p key={lineIdx} className="text-white/90 text-xs whitespace-pre-wrap leading-relaxed">
              {formatMentionsInText(line)}
            </p>
          );
        })}
      </div>
    );
  };

  async function openDealHistory(deal: Deal) {
    setSelectedDealForHistory(deal);
    setModalUpdateTab("comment");
    setNewComment("");
    setAutoGeneratedLogs([]);
    setStageToMove(null);
    setReassignTo("");
    setIsSubtaskModalOpen(false);
    setIsQuoteUploaderOpen(false);

    // Marca como visualizado o alerta de tarefa concluída nesta atividade
    if (unreadParentAlerts[deal.id]) {
      handleMarkAlertAsSeen(deal.id);
    }
    const currentLastSeen = getResponsibleLastSeen(deal);
    setInitialLastSeenTime(currentLastSeen);
    if (deal.assigned_user_id === user?.id) {
      updateDealLastSeen(deal);
    }
    setAdminEditDeadline(deal.expected_close_date || new Date().toISOString().split("T")[0]);
    setIsEditingDeadline(false);
    setIsEditingTitle(false);
    setIsTimelineOpen(false);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("crm_deal_history")
        .select("*")
        .eq("deal_id", deal.id)
        .order("created_at", { ascending: false });

      if (error && error.code !== "42P01") {
        console.warn("Aviso ao carregar histórico:", error.message);
      }
      const formattedHistory = (data || []).map((h) => ({
        ...h,
        user_name: (h.user_name || "Usuário").toUpperCase(),
      }));
      setDealHistoryList(formattedHistory);
      if (formattedHistory.length > 0) {
        const latestRealDate = formattedHistory[0].created_at;
        setSelectedDealForHistory((prev) => (prev ? { ...prev, latest_update_at: latestRealDate } : null));
        setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, latest_update_at: latestRealDate } : d)));
      }
    } catch (err: any) {
      console.error("Erro ao buscar histórico:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Abertura automática de atividade requisitada via Central de Alertas ADM ou URL
  useEffect(() => {
    if (deals.length > 0 && !selectedDealForHistory) {
      const storedDealId = sessionStorage.getItem("mykaflow_open_deal_id");
      const urlParams = new URLSearchParams(window.location.search);
      const paramDealId = urlParams.get("dealId") || storedDealId;

      if (paramDealId) {
        sessionStorage.removeItem("mykaflow_open_deal_id");
        const found = deals.find((d) => d.id === paramDealId);
        if (found) {
          openDealHistory(found);
        }
      }
    }
  }, [deals]);

  const handleStartEditTitle = () => {
    if (!selectedDealForHistory) return;
    const cleanTitle = getCleanDealTitle(selectedDealForHistory.title);
    setEditingTitleValue(cleanTitle);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!selectedDealForHistory || !editingTitleValue.trim()) return;

    // Responsável ou Administrador podem alterar o título
    const canEditTitle = isAdmin || selectedDealForHistory.assigned_user_id === user?.id;
    if (!canEditTitle) {
      return toast.error("Apenas o responsável ou o Administrador podem alterar o título.");
    }

    setIsSavingTitle(true);
    const deal = selectedDealForHistory;
    const nowIso = new Date().toISOString();
    const oldTitleClean = getCleanDealTitle(deal.title);
    const newTitleClean = editingTitleValue.trim().toUpperCase();

    const titleWords = newTitleClean.split(/\s+/).filter(Boolean);
    if (titleWords.length > 6) {
      setIsSavingTitle(false);
      return toast.error(`O título deve conter no máximo 6 palavras (atualmente com ${titleWords.length} palavras).`);
    }

    // Se o título não mudou, apenas fecha a edição
    if (oldTitleClean === newTitleClean) {
      setIsEditingTitle(false);
      setIsSavingTitle(false);
      return;
    }

    try {
      const prefixMatch = deal.title.match(/^\[[^\]]+\]\s*/i);
      const prefix = prefixMatch ? prefixMatch[0] : "";
      const finalTitle = `${prefix}${newTitleClean}`;

      const { error } = await supabase
        .from("crm_deals")
        .update({
          title: finalTitle,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      const desc = `Título da atividade alterado de "${oldTitleClean}" para "${newTitleClean}" por ${user?.user_metadata?.display_name || user?.email}.`;

      await registerHistoryEntry(deal.id, "title_changed", desc);

      const historyEntry: DealHistoryItem = {
        id: crypto.randomUUID(),
        deal_id: deal.id,
        user_name: user?.user_metadata?.display_name || user?.email || "Usuário",
        action_type: "title_changed",
        description: desc,
        created_at: nowIso,
      };

      setDealHistoryList((prev) => [historyEntry, ...prev]);

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, title: finalTitle, updated_at: nowIso }
            : d
        )
      );

      setSelectedDealForHistory((prev) =>
        prev
          ? {
              ...prev,
              title: finalTitle,
              updated_at: nowIso,
            }
          : null
      );

      setIsEditingTitle(false);
      toast.success("Título da atividade atualizado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao alterar título: " + (err.message || "Tente novamente"));
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleStartEditCustomer = () => {
    if (!selectedDealForHistory || role !== "admin") return;
    setEditingCustomerId(selectedDealForHistory.customer_id || "");
    setEditingCustomerSearch("");
    setIsEditingCustomer(true);
  };

  const handleSaveCustomer = async (newCustomerId: string | null) => {
    if (!selectedDealForHistory || role !== "admin") return;

    setIsSavingCustomer(true);
    const deal = selectedDealForHistory;
    const nowIso = new Date().toISOString();
    const oldCustomer = getDealCustomer(deal);
    const oldCustomerName = oldCustomer?.company_name || oldCustomer?.name || deal.customer_name || "Uso Interno / Empresa";

    const newCustomer = newCustomerId ? customers.find((c) => c.id === newCustomerId) : null;
    const newCustomerName = newCustomer ? (newCustomer.company_name || newCustomer.name || "Cliente") : "Uso Interno / Empresa";

    if (deal.customer_id === (newCustomerId || null)) {
      setIsEditingCustomer(false);
      setIsSavingCustomer(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("crm_deals")
        .update({
          customer_id: newCustomerId || null,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      const desc = `Cliente da atividade alterado de "${oldCustomerName}" para "${newCustomerName}" pelo Administrador.`;
      await registerHistoryEntry(deal.id, "customer_changed", desc);

      const historyEntry: DealHistoryItem = {
        id: crypto.randomUUID(),
        deal_id: deal.id,
        user_name: user?.user_metadata?.display_name || user?.email || "Administrador",
        action_type: "customer_changed",
        description: desc,
        created_at: nowIso,
      };

      setDealHistoryList((prev) => [historyEntry, ...prev]);

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? {
                ...d,
                customer_id: newCustomerId || null,
                customer_name: newCustomerName,
                crm_customers: newCustomer ? { name: newCustomer.name, company_name: newCustomer.company_name } : null,
                updated_at: nowIso,
              }
            : d
        )
      );

      setSelectedDealForHistory((prev) =>
        prev
          ? {
              ...prev,
              customer_id: newCustomerId || null,
              customer_name: newCustomerName,
              crm_customers: newCustomer ? { name: newCustomer.name, company_name: newCustomer.company_name } : null,
              updated_at: nowIso,
            }
          : null
      );

      setIsEditingCustomer(false);
      toast.success(`Cliente atualizado para "${newCustomerName}" com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao alterar cliente: " + (err.message || "Tente novamente"));
    } finally {
      setIsSavingCustomer(false);
    }
  };

  async function handleAdminUpdateDeadline() {
    if (!selectedDealForHistory || !adminEditDeadline) return;
    if (role !== "admin") {
      return toast.error("Apenas administradores podem alterar o prazo de qualquer requisição");
    }

    setIsSavingDeadline(true);
    const deal = selectedDealForHistory;
    const nowIso = new Date().toISOString();
    const oldDeadlineFmt = deal.expected_close_date
      ? deal.expected_close_date.split("-").reverse().join("/")
      : "Não definido";
    const newDeadlineFmt = adminEditDeadline.split("-").reverse().join("/");

    try {
      const { error } = await supabase
        .from("crm_deals")
        .update({
          expected_close_date: adminEditDeadline,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      const desc = `Prazo alterado de ${oldDeadlineFmt} para ${newDeadlineFmt} pelo Administrador (${user?.user_metadata?.display_name || user?.email}).`;

      await registerHistoryEntry(
        deal.id,
        "deadline_changed",
        desc
      );

      const historyEntry: DealHistoryItem = {
        id: crypto.randomUUID(),
        deal_id: deal.id,
        user_name: user?.user_metadata?.display_name || user?.email || "Administrador",
        action_type: "deadline_changed",
        description: desc,
        created_at: nowIso,
      };

      setDealHistoryList((prev) => [historyEntry, ...prev]);

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, expected_close_date: adminEditDeadline, updated_at: nowIso }
            : d
        )
      );

      setSelectedDealForHistory((prev) =>
        prev
          ? {
              ...prev,
              expected_close_date: adminEditDeadline,
              updated_at: nowIso,
            }
          : null
      );

      setIsEditingDeadline(false);
      toast.success(`Prazo alterado para ${newDeadlineFmt} com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao alterar prazo: " + err.message);
    } finally {
      setIsSavingDeadline(false);
    }
  }

  async function registerHistoryEntry(
    dealId: string,
    actionType: string,
    description: string,
    oldVal?: string,
    newVal?: string
  ) {
    const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
    const nowIso = new Date().toISOString();

    try {
      await supabase.from("crm_deal_history").insert({
        deal_id: dealId,
        user_id: user?.id,
        user_name: userName,
        action_type: actionType,
        description: description,
        old_value: oldVal || null,
        new_value: newVal || null,
        created_at: nowIso,
      });

      await supabase
        .from("crm_deals")
        .update({ updated_at: nowIso })
        .eq("id", dealId);

      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, updated_at: nowIso } : d))
      );
    } catch (err) {
      console.warn("Erro ao gravar histórico:", err);
    }
  }

  const [isDeletingDeal, setIsDeletingDeal] = useState<boolean>(false);
  const [crmConfirmConfig, setCrmConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "info" | "success";
    requireKeyword?: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  function handleDeleteDeal(deal: Deal) {
    if (role !== "admin") {
      return toast.error("Apenas administradores podem remover requisições do sistema");
    }

    const reqNum = getDealReqNumber(deal, deals);
    const cleanTitle = deal.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "");

    setCrmConfirmConfig({
      isOpen: true,
      title: `Excluir Requisição Nº ${reqNum}`,
      description: `Tem certeza que deseja excluir permanentemente a Requisição Nº ${reqNum} ("${cleanTitle}")?\n\nEsta ação removerá a requisição e todo o seu histórico e não poderá ser desfeita.`,
      confirmText: "Excluir Definitivamente",
      variant: "danger",
      onConfirm: async () => {
        setCrmConfirmConfig(null);
        setIsDeletingDeal(true);
        try {
          // 1. Remove histórico vinculado
          try {
            await supabase
              .from("crm_deal_history")
              .delete()
              .eq("deal_id", deal.id);
          } catch (hErr) {
            console.warn("Aviso ao remover histórico da requisição:", hErr);
          }

          // 2. Remove a requisição do CRM
          const { error } = await supabase
            .from("crm_deals")
            .delete()
            .eq("id", deal.id);

          if (error) throw error;

          // 3. Atualiza estado local
          setDeals((prev) => prev.filter((d) => d.id !== deal.id));
          setSelectedDealForHistory(null);
          toast.success(`Requisição Nº ${reqNum} excluída com sucesso!`);
        } catch (err: any) {
          toast.error("Erro ao excluir requisição: " + (err.message || "Tente novamente"));
        } finally {
          setIsDeletingDeal(false);
        }
      },
    });
  }

  // Notificação Automática para Atividade Mãe quando uma Tarefa Vinculada é Concluída
  async function notifyParentDealIfSubtask(completedDeal: Deal, completionNote?: string) {
    try {
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";

      // Procura histórico no CRM onde esta tarefa foi vinculada a uma atividade mãe
      const { data: linkHistories } = await supabase
        .from("crm_deal_history")
        .select("deal_id, description")
        .ilike("description", `%${completedDeal.id}%`)
        .order("created_at", { ascending: false });

      let parentDealId: string | null = null;
      if (linkHistories && linkHistories.length > 0) {
        parentDealId = linkHistories[0].deal_id;
      }

      if (!parentDealId && completedDeal.notes) {
        const match = completedDeal.notes.match(/(?:Tarefa|Atividade)\s*vinculada\s*a:\s*(.*?)\s*\(Nº\s*([0-9.]+)\)/i);
        if (match && match[2]) {
          const found = deals.find((d) => getDealReqNumber(d, deals) === match[2]);
          if (found) parentDealId = found.id;
        }
      }

      if (parentDealId && parentDealId !== completedDeal.id) {
        const cleanSubtaskTitle = completedDeal.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA)\]\s*/i, "");
        const metaObj = {
          type: "subtask_completed",
          subtaskId: completedDeal.id,
          subtaskTitle: cleanSubtaskTitle,
          userName,
          userId: user?.id,
        };
        const subtaskCompTag = `[SUBTASK_COMPLETED:${JSON.stringify(metaObj)}]`;
        const noteSuffix = completionNote ? ` - "${completionNote}"` : "";
        const desc = `${subtaskCompTag} ${userName} concluiu a tarefa "${cleanSubtaskTitle}"${noteSuffix}`;

        await registerHistoryEntry(parentDealId, "subtask_completed", desc);

        // Marca e incrementa o alerta numérico no card da atividade mãe
        const prevCount = Number(unreadParentAlerts[parentDealId]) || 0;
        const currentAlerts = { ...unreadParentAlerts, [parentDealId]: prevCount + 1 };
        saveParentAlerts(currentAlerts);
      }
    } catch (err) {
      console.warn("Aviso ao notificar atividade mãe sobre conclusão de subtarefa:", err);
    }
  }

  // Criação de Nova Tarefa Vinculada a partir do Card Expandido
  async function handleCreateSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDealForHistory) return;
    if (!subtaskTitle.trim()) {
      return toast.error("Informe o título da vinculada.");
    }
    const subtaskWords = subtaskTitle.trim().split(/\s+/).filter(Boolean);
    if (subtaskWords.length > 6) {
      return toast.error(`O título da vinculada deve conter no máximo 6 palavras (atualmente com ${subtaskWords.length} palavras). Detalhe as orientações no campo de instruções.`);
    }
    if (!subtaskAssignedTo) {
      return toast.error("Selecione o responsável pela vinculada.");
    }

    setIsCreatingSubtask(true);
    try {
      const generatedReqNumber = generateNextReqNumber(deals);
      const assignedProf = teamMembers.find((m) => m.id === subtaskAssignedTo);
      const assignedName = assignedProf?.display_name || assignedProf?.email || "Responsável";
      const creatorName = user?.user_metadata?.display_name || user?.email || "Você";

      const parentReqNum = getDealReqNumber(selectedDealForHistory, deals);
      const parentCleanTitle = selectedDealForHistory.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "");
      const parentMeta = {
        parentId: selectedDealForHistory.id,
        parentTitle: parentCleanTitle,
        parentReq: parentReqNum,
      };
      const parentDealTag = `[PARENT_DEAL:${JSON.stringify(parentMeta)}]`;
      const targetStage = (
        selectedDealForHistory.stage === "proposal" ? "negotiation" : selectedDealForHistory.stage
      ) as Deal["stage"];

      const subtaskNotesFormatted = subtaskNotes.trim() ? `[${creatorName}]: ${subtaskNotes.trim()}${subtaskNotes.trim().endsWith(".") ? "" : "."}` : "";

      const subtaskPayload = {
        title: `[TAREFA] ${subtaskTitle.trim().toUpperCase()}`,
        stage: targetStage,
        customer_id: selectedDealForHistory.customer_id || null,
        user_id: user?.id,
        assigned_user_id: subtaskAssignedTo,
        expected_close_date: subtaskDeadline || null,
        notes: [
          `${parentDealTag} Atividade vinculada a: ${parentCleanTitle} (Nº ${parentReqNum})`,
          subtaskNotesFormatted,
        ].filter(Boolean).join("\n"),
      };

      const { data: createdData, error } = await supabase
        .from("crm_deals")
        .insert(subtaskPayload)
        .select()
        .single();

      if (error) throw error;

      // 1. Cria histórico da própria nova vinculada
      try {
        await supabase.from("crm_deal_history").insert({
          deal_id: createdData.id,
          user_id: user?.id,
          user_name: creatorName,
          action_type: "created",
          description: `Vinculada criada a partir da atividade "${selectedDealForHistory.title}" e direcionada para ${assignedName}.`,
        });
      } catch (hErr) {
        console.warn("Aviso ao criar histórico da vinculada:", hErr);
      }

      // 2. Monta o texto limpo da criação da vinculada e insere na lista de logs imutáveis
      const subtaskText = `${creatorName} criou a vinculada "${subtaskTitle.trim().toUpperCase()}" para o ${assignedName}.`;

      // Adiciona a nova vinculada na lista local de deals
      const newDealItem: Deal = {
        ...createdData,
        req_number: createdData.req_number || generatedReqNumber,
        creator_name: creatorName,
        latest_update_author: creatorName,
        customer_name: selectedDealForHistory.customer_name || "Uso Interno / Empresa",
        assigned_user_name: assignedName,
      };

      setDeals((prev) => [...prev, newDealItem]);

      // Insere o registro imutável no bloco de atualização
      appendAutoLog(subtaskText);

      // Limpa formulário da subtarefa e muda para a aba de Nova Atualização
      setSubtaskTitle("");
      setSubtaskAssignedTo("");
      setSubtaskDeadline("");
      setSubtaskNotes("");
      setIsSubtaskModalOpen(false);
      setModalUpdateTab("comment");

      toast.success(`Vinculada criada! O registro foi inserido no campo de Nova Atualização.`);
    } catch (err: any) {
      toast.error("Erro ao criar vinculada: " + (err.message || "Tente novamente"));
    } finally {
      setIsCreatingSubtask(false);
    }
  }

  // Upload e Otimização Automática do Arquivo de Orçamento Oficial
  async function handleUploadQuoteFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedDealForHistory) return;

    setIsUploadingQuoteFile(true);
    const toastId = toast.loading("Otimizando e comprimindo arquivo...");

    try {
      // 1. Compressão client-side (Imagens são convertidas para WebP 1500px máx e ~100KB)
      const { file: optimizedBlob, fileName } = await compressImageForUpload(file);
      const originalSizeKb = Math.round(file.size / 1024);
      const optimizedSizeKb = Math.round(optimizedBlob.size / 1024);

      toast.loading(`Salvando documento (${optimizedSizeKb} KB - reduzido de ${originalSizeKb} KB)...`, { id: toastId });

      // 2. Upload para o Supabase Storage
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `quotes/${selectedDealForHistory.id}/${Date.now()}_${sanitizedName}`;

      let publicUrl = "";
      try {
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("crm-attachments")
          .upload(path, optimizedBlob, {
            upsert: true,
            contentType: optimizedBlob.type || (fileName.endsWith(".pdf") ? "application/pdf" : "image/webp"),
          });

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from("crm-attachments").getPublicUrl(path);
          publicUrl = urlData.publicUrl;
        } else if (uploadError?.message?.toLowerCase().includes("not found")) {
          await supabase.storage.createBucket("crm-attachments", { public: true });
          const { data: retryData, error: retryErr } = await supabase.storage
            .from("crm-attachments")
            .upload(path, optimizedBlob, { upsert: true, contentType: optimizedBlob.type });
          if (!retryErr && retryData) {
            const { data: urlData } = supabase.storage.from("crm-attachments").getPublicUrl(path);
            publicUrl = urlData.publicUrl;
          }
        }
      } catch (storageErr) {
        console.warn("Storage upload warning, falling back to data URL:", storageErr);
      }

      if (!publicUrl) {
        publicUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(optimizedBlob);
        });
      }

      // Executa a extração inteligente e automática de dados se for documento financeiro/orçamento
      let extractedQuoteData: ExtractedQuoteData | null = null;
      try {
        toast.loading("Lendo e processando arquivo...", { id: toastId });
        extractedQuoteData = await extractQuoteDataFromDocument(optimizedBlob, file.type || "application/pdf");
      } catch (extErr) {
        console.warn("Aviso ao extrair dados do arquivo via IA:", extErr);
      }

      const nowIso = new Date().toISOString();
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";

      const quoteTag = `[QUOTE_FILE:${JSON.stringify({ url: publicUrl, name: fileName, uploadedAt: nowIso, quoteData: extractedQuoteData })}]`;
      const quoteDataTag = extractedQuoteData ? `[QUOTE_DATA:${JSON.stringify(extractedQuoteData)}]` : "";
      
      const cleanNotes = (selectedDealForHistory.notes || "")
        .replace(/\[QUOTE_FILE:.*?\]\s*/g, "")
        .replace(/\[QUOTE_DATA:.*?\]\s*/g, "")
        .trim();
      
      const updatedNotesWithQuote = [quoteTag, quoteDataTag, cleanNotes].filter(Boolean).join("\n").trim();

      const updateDealPayload: any = {
        quote_file_url: publicUrl,
        quote_file_name: fileName,
        quote_file_uploaded_at: nowIso,
        notes: updatedNotesWithQuote,
        updated_at: nowIso,
      };

      // Se o orçamento extraiu o valor total, atualiza também o valor da atividade
      if (extractedQuoteData?.totalAmount && extractedQuoteData.totalAmount > 0) {
        updateDealPayload.value = extractedQuoteData.totalAmount;
      }

      try {
        await supabase
          .from("crm_deals")
          .update(updateDealPayload)
          .eq("id", selectedDealForHistory.id);
      } catch {
        await supabase
          .from("crm_deals")
          .update({
            notes: updatedNotesWithQuote,
            updated_at: nowIso,
          })
          .eq("id", selectedDealForHistory.id);
      }

      const docMeta = JSON.stringify({ url: publicUrl, name: fileName, sizeKb: optimizedSizeKb, uploadedAt: nowIso, quoteData: extractedQuoteData });
      await registerHistoryEntry(
        selectedDealForHistory.id,
        "quote_file_uploaded",
        `[QUOTE_DOC:${docMeta}] ${userName} anexou o arquivo "${fileName}" (${optimizedSizeKb} KB).`
      );

      const updatedDeal: Deal = {
        ...selectedDealForHistory,
        value: extractedQuoteData?.totalAmount || selectedDealForHistory.value,
        quote_file_url: publicUrl,
        quote_file_name: fileName,
        quote_file_uploaded_at: nowIso,
        notes: updatedNotesWithQuote,
        updated_at: nowIso,
      };

      setSelectedDealForHistory(updatedDeal);
      setDeals((prev) => prev.map((d) => (d.id === updatedDeal.id ? updatedDeal : d)));
      setIsQuoteUploaderOpen(false);
      setPreviewingQuoteFile({ url: publicUrl, name: fileName });

      // Insere linha imutável no bloco de atualização do card expandido
      const quoteActionText = `${userName} anexou o arquivo "${fileName}" (${optimizedSizeKb} KB).`;
      appendAutoLog(quoteActionText);

      toast.success(`Arquivo anexado com sucesso! (${optimizedSizeKb} KB)`, { id: toastId });
    } catch (err: any) {
      toast.error("Erro ao anexar arquivo: " + (err.message || "Tente novamente"), { id: toastId });
    } finally {
      setIsUploadingQuoteFile(false);
      e.target.value = "";
    }
  }

  // Ação de Iniciar ou Parar Atividade (Toggle de um único botão)
  const handleToggleWorkActivity = async (deal: Deal, forceSwitch: boolean = false) => {
    if (!user) return;

    // 1. Permissão: apenas o próprio responsável atribuído ou Administrador podem iniciar/parar
    const isAssigned = isAdmin || deal.assigned_user_id === user.id;
    if (!isAssigned) {
      toast.error("Somente o responsável atribuído ou o Administrador podem iniciar esta atividade.");
      return;
    }

    if (isDealPendingAuthorAcceptance(deal) || deal.stage === "archived" || deal.stage === "completed" || deal.stage === "won" || deal.stage === "lost") {
      toast.error("Esta atividade já foi finalizada/armazenada e não pode ser iniciada.");
      return;
    }

    const activeWorker = getDealActiveWorker(deal);
    const isCurrentlyWorkingThisDeal = Boolean(activeWorker && activeWorker.userId === user.id);

    // Se já está trabalhando nesta atividade, executa a PARADA
    if (isCurrentlyWorkingThisDeal) {
      const nowIso = new Date().toISOString();
      const startTime = new Date(activeWorker.startedAt).getTime();
      const durationSeconds = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
      const formattedDuration = formatDurationHoursMinutes(durationSeconds);
      const userName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email || "Usuário";

      const session: DealTimeSession = {
        id: crypto.randomUUID(),
        deal_id: deal.id,
        user_id: user.id,
        user_name: userName,
        started_at: activeWorker.startedAt,
        ended_at: nowIso,
        duration_seconds: durationSeconds,
        stop_reason: "manual",
      };

      // Registra auditoria de sessão
      recordActivitySessionAudit({
        dealId: deal.id,
        dealTitle: deal.title,
        userId: user.id,
        userName,
        startedAtIso: activeWorker.startedAt,
        endedAtIso: nowIso,
        durationSeconds,
        durationFormatted: formattedDuration,
        closeType: "manual",
      });

      const sessionTag = `[WORK_LOG:${JSON.stringify(session)}]`;
      const cleanNotes = (deal.notes || "").replace(/\[WORK_ACTIVE:.*?\]\s*/g, "").trim();
      const updatedNotes = `${sessionTag}\n${cleanNotes}`.trim();

      try {
        await supabase
          .from("crm_deals")
          .update({
            notes: updatedNotes,
            updated_at: nowIso,
          })
          .eq("id", deal.id);

        const updatedDeal: Deal = {
          ...deal,
          notes: updatedNotes,
          latest_update_at: deal.latest_update_at || deal.created_at,
        };

        setSelectedDealForHistory(updatedDeal);
        setDeals((prev) => prev.map((d) => (d.id === updatedDeal.id ? updatedDeal : d)));
      } catch (err: any) {
        toast.error("Erro ao pausar atividade: " + (err.message || "Tente novamente"));
      }
      return;
    }

    // Se vai INICIAR a atividade:
    // 2. Validação de horário comercial (Regra 3: Fora de horário exige autorização do ADM)
    const timeCheck = isBusinessWorkTime();
    if (!timeCheck.allowed && !isAdmin) {
      toast.warning(`${timeCheck.reason} Solicite autorização ao Administrador para iniciar.`);
      return;
    }

    // 3. Unicidade: se o usuário já estiver com outra atividade ativa, questiona como quer prosseguir
    const otherRunningDeal = deals.find((other) => {
      if (other.id === deal.id) return false;
      const otherActive = getDealActiveWorker(other);
      return Boolean(otherActive && otherActive.userId === user.id);
    });

    if (otherRunningDeal && !forceSwitch) {
      setWorkingConflictModal({
        previousDeal: otherRunningDeal,
        targetDeal: deal,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const userName = getFirstName(user.user_metadata?.display_name || user.email || "Usuário");

    // Se confirmou a troca ou não havia outra, encerra a anterior se existir
    if (otherRunningDeal) {
      const otherActive = getDealActiveWorker(otherRunningDeal);
      if (otherActive) {
        const otherDuration = Math.max(1, Math.floor((Date.now() - new Date(otherActive.startedAt).getTime()) / 1000));
        const prevSession: DealTimeSession = {
          id: crypto.randomUUID(),
          deal_id: otherRunningDeal.id,
          user_id: user.id,
          user_name: userName,
          started_at: otherActive.startedAt,
          ended_at: nowIso,
          duration_seconds: otherDuration,
          stop_reason: "auto_switch",
        };
        // Registra auditoria da atividade anterior finalizada na troca
        recordActivitySessionAudit({
          dealId: otherRunningDeal.id,
          dealTitle: otherRunningDeal.title,
          userId: user.id,
          userName,
          startedAtIso: otherActive.startedAt,
          endedAtIso: nowIso,
          durationSeconds: otherDuration,
          durationFormatted: formatDurationHoursMinutes(otherDuration),
          closeType: "manual",
          notes: "Troca de atividade em andamento",
        });

        const sessionTag = `[WORK_LOG:${JSON.stringify(prevSession)}]`;
        const cleanNotes = (otherRunningDeal.notes || "").replace(/\[WORK_ACTIVE:.*?\]\s*/g, "").trim();
        const prevUpdatedNotes = `${sessionTag}\n${cleanNotes}`.trim();

        try {
          await supabase.from("crm_deals").update({ notes: prevUpdatedNotes, updated_at: nowIso }).eq("id", otherRunningDeal.id);
          setDeals((prev) => prev.map((d) => (d.id === otherRunningDeal.id ? { ...d, notes: prevUpdatedNotes, latest_update_at: d.latest_update_at || d.created_at } : d)));
        } catch (e) {}
      }
    }

    // Inicia a sessão na atividade atual
    const activeTag = `[WORK_ACTIVE:${JSON.stringify({ userId: user.id, userName, startedAt: nowIso })}]`;
    const currentClean = (deal.notes || "").replace(/\[WORK_ACTIVE:.*?\]\s*/g, "").trim();
    const updatedNotes = `${activeTag}\n${currentClean}`.trim();

    try {
      await supabase
        .from("crm_deals")
        .update({
          notes: updatedNotes,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      const updatedDeal: Deal = {
        ...deal,
        notes: updatedNotes,
        latest_update_at: deal.latest_update_at || deal.created_at,
      };

      setSelectedDealForHistory(updatedDeal);
      setDeals((prev) => prev.map((d) => (d.id === updatedDeal.id ? updatedDeal : d)));
      setStageCustomOrders((prev) => {
        const currentStageList = prev[deal.stage] || [];
        const filtered = currentStageList.filter((id) => id !== deal.id);
        const updated = {
          ...prev,
          [deal.stage]: [deal.id, ...filtered],
        };
        try {
          localStorage.setItem("mykaflow_crm_custom_order", JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
      setWorkingConflictModal(null);
    } catch (err: any) {
      toast.error("Erro ao iniciar atividade: " + (err.message || "Tente novamente"));
    }
  };

  // Marcar Menção como Lida (Exclusivo para o próprio usuário mencionado)
  const handleMarkMentionAsRead = async (deal: Deal, mentionId: string) => {
    if (!user) return;
    const mentions = getDealMentions(deal);
    const targetMention = mentions.find((m) => m.id === mentionId);
    
    // Regra estrita: Somente o próprio destinatário pode marcar como lida (nem mesmo o ADM)
    if (!targetMention || targetMention.mentioned_user_id !== user.id) {
      return toast.error("Somente o destinatário da menção pode marcá-la como lida.");
    }

    if (targetMention.read_by_user) return;

    const updatedMentions = mentions.map((m) =>
      m.id === mentionId ? { ...m, read_by_user: true } : m
    );

    // Substitui as tags antigas pelas novas
    let notesClean = (deal.notes || "").replace(/\[MENTION:.*?\]\s*/g, "").trim();
    const newTags = updatedMentions.map((m) => `[MENTION:${JSON.stringify(m)}]`).join("\n");
    const updatedNotes = newTags ? `${newTags}\n${notesClean}`.trim() : notesClean;

    try {
      // Atualiza SEM mudar updated_at para não alterar a coloração de prazo da atividade
      await supabase.from("crm_deals").update({ notes: updatedNotes }).eq("id", deal.id);
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, notes: updatedNotes } : d)));
      if (selectedDealForHistory?.id === deal.id) {
        setSelectedDealForHistory((prev) => (prev ? { ...prev, notes: updatedNotes } : null));
      }
      toast.success("Menção marcada como lida!");
    } catch (err: any) {
      toast.error("Erro ao marcar como lida: " + err.message);
    }
  };

  // Responder à Menção (Fica vinculada diretamente à menção original, sem gerar nova atualização na atividade)
  const handleSendMentionReply = async (deal: Deal, mentionId: string) => {
    if (!user) return;
    const replyText = (mentionReplyText[mentionId] || "").trim();
    if (!replyText) {
      return toast.error("Digite uma resposta antes de enviar.");
    }

    const currentUserName = user.user_metadata?.display_name || user.email || "Usuário";
    const nowIso = new Date().toISOString();

    const replyObj: DealMentionReply = {
      id: crypto.randomUUID(),
      mention_id: mentionId,
      deal_id: deal.id,
      user_id: user.id,
      user_name: currentUserName,
      reply_text: replyText,
      created_at: nowIso,
    };

    const mentionTags: string[] = [];
    teamMembers.forEach((member) => {
      const memberName = member.display_name || member.email || "";
      const firstName = memberName.split(" ")[0];
      const mentionRegex = new RegExp(`@(${escapeRegExp(memberName)}|${escapeRegExp(firstName)}|${escapeRegExp(member.email || "")})\\b`, "i");
      if (mentionRegex.test(replyText)) {
        const mentionObj: DealMention = {
          id: crypto.randomUUID(),
          deal_id: deal.id,
          author_id: user.id,
          author_name: currentUserName,
          mentioned_user_id: member.id,
          mentioned_user_name: memberName,
          content: replyText,
          created_at: nowIso,
          read_by_user: false,
        };
        mentionTags.push(`[MENTION:${JSON.stringify(mentionObj)}]`);
      }
    });

    const replyTag = `[MENTION_REPLY:${JSON.stringify(replyObj)}]`;
    const tagsBlock = mentionTags.length > 0 ? mentionTags.join("\n") + "\n" : "";
    const updatedNotes = `${replyTag}\n${tagsBlock}${deal.notes || ""}`.trim();
    const historyDesc = `↩ Resposta à atualização:\n${replyText}`;
    const historyEntry: DealHistoryItem = {
      id: replyObj.id,
      deal_id: deal.id,
      user_name: currentUserName.toUpperCase(),
      action_type: "reply",
      description: historyDesc,
      created_at: nowIso,
    };

    try {
      // Salva a resposta no deal SEM alterar o updated_at para não modificar a coloração das atualizações
      await supabase.from("crm_deals").update({ notes: updatedNotes }).eq("id", deal.id);

      // Registra a resposta no histórico permanente da atividade
      try {
        await supabase.from("crm_deal_history").insert({
          id: replyObj.id,
          deal_id: deal.id,
          user_id: user.id,
          user_name: currentUserName,
          action_type: "reply",
          description: historyDesc,
          created_at: nowIso,
        });
      } catch (histErr) {
        console.warn("Aviso ao salvar histórico de resposta:", histErr);
      }

      setDealHistoryList((prev) => [historyEntry, ...prev]);
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, notes: updatedNotes } : d)));
      if (selectedDealForHistory?.id === deal.id) {
        setSelectedDealForHistory((prev) => (prev ? { ...prev, notes: updatedNotes } : null));
      }

      setMentionReplyText((prev) => ({ ...prev, [mentionId]: "" }));
      setReplyingToMentionId(null);
      toast.success("Resposta enviada e vinculada à linha do tempo!");
    } catch (err: any) {
      toast.error("Erro ao enviar resposta: " + err.message);
    }
  };

  // Remover Arquivo Anexado
  function handleRemoveQuoteFile() {
    if (!selectedDealForHistory) return;
    setCrmConfirmConfig({
      isOpen: true,
      title: "Remover Arquivo",
      description: "Deseja remover o arquivo anexado a esta atividade?",
      confirmText: "Remover Arquivo",
      variant: "warning",
      onConfirm: async () => {
        setCrmConfirmConfig(null);
        try {
          const nowIso = new Date().toISOString();
          const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
          const cleanNotes = (selectedDealForHistory.notes || "").replace(/\[QUOTE_FILE:.*?\]\s*/g, "").trim();

          try {
            await supabase
              .from("crm_deals")
              .update({
                quote_file_url: null,
                quote_file_name: null,
                quote_file_uploaded_at: null,
                notes: cleanNotes || null,
                updated_at: nowIso,
              })
              .eq("id", selectedDealForHistory.id);
          } catch {
            await supabase
              .from("crm_deals")
              .update({
                notes: cleanNotes || null,
                updated_at: nowIso,
              })
              .eq("id", selectedDealForHistory.id);
          }

          await registerHistoryEntry(
            selectedDealForHistory.id,
            "quote_file_removed",
            `${userName} removeu o arquivo anexado.`
          );

          const updatedDeal: Deal = {
            ...selectedDealForHistory,
            quote_file_url: null,
            quote_file_name: null,
            quote_file_uploaded_at: null,
            notes: cleanNotes || undefined,
            updated_at: nowIso,
          };

          setSelectedDealForHistory(updatedDeal);
          setDeals((prev) => prev.map((d) => (d.id === updatedDeal.id ? updatedDeal : d)));

          // Insere linha imutável no bloco de atualização do card expandido
          const removeQuoteText = `${userName} removeu o orçamento anexado.`;
          appendAutoLog(removeQuoteText);

          toast.success("Orçamento removido.");
        } catch (err: any) {
          toast.error("Erro ao remover: " + err.message);
        }
      },
    });
  }

  // Concluir Vinculada (Fecha e armazena como concluída, gera linhas automáticas na vinculada e na atividade mãe)
  function handleCompleteSubtask(deal: Deal) {
    if (!newComment.trim()) {
      toast.error("É obrigatório preencher o campo de atualização com o andamento/conclusão da vinculada.");
      return;
    }

    const reqNum = getDealReqNumber(deal, deals);
    const cleanTitle = getCleanDealTitle(deal.title);
    const isNotAuthor = Boolean(deal.user_id && deal.user_id !== user?.id);

    setCrmConfirmConfig({
      isOpen: true,
      title: isNotAuthor ? `Finalizar Vinculada Nº ${reqNum}` : `Concluir Vinculada Nº ${reqNum}`,
      description: isNotAuthor
        ? `Deseja finalizar a Vinculada Nº ${reqNum} ("${cleanTitle}")?\n\nEla permanecerá visível na coluna até que o autor (${deal.creator_name || "Autor"}) aceite a conclusão.`
        : `Deseja concluir a Vinculada Nº ${reqNum} ("${cleanTitle}")?\n\nEla será fechada e armazenada como concluída, e a atividade principal receberá a notificação de conclusão.`,
      confirmText: isNotAuthor ? "Finalizar e Notificar Autor" : "Concluir e Armazenar",
      variant: isNotAuthor ? "info" : "success",
      onConfirm: async () => {
        setCrmConfirmConfig(null);
        try {
          const nowIso = new Date().toISOString();
          const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
          const completionText = newComment.trim();

          const completionNotif: TaskCompletionNotification = {
            id: crypto.randomUUID(),
            deal_id: deal.id,
            deal_title: cleanTitle,
            req_number: reqNum,
            author_id: deal.user_id || "",
            author_name: deal.creator_name || "Autor",
            concluded_by_user_id: user?.id || "",
            concluded_by_user_name: userName,
            completion_notes: completionText,
            created_at: nowIso,
            status: isNotAuthor ? "pending_acceptance" : "accepted",
          };
          const notifTag = `[TASK_COMPLETION_NOTIFICATION:${JSON.stringify(completionNotif)}]`;

          // 1. Linha automática imutável da conclusão na vinculada
          const autoLogLine = `${userName} concluiu a vinculada "${cleanTitle}".`;
          const existingTags = (deal.notes || "").match(/\[(QUOTE_FILE|PARENT_DEAL|WORK_LOG|WORK_ACTIVE|QUOTE_DATA|MENTION|MENTION_REPLY|SUBTASK_COMPLETION|TASK_COMPLETION_NOTIFICATION):.*?\]/g) || [];
          const cleanOldNotes = (deal.notes || "")
            .replace(/\[(QUOTE_FILE|PARENT_DEAL|WORK_LOG|WORK_ACTIVE|QUOTE_DATA|MENTION|MENTION_REPLY|SUBTASK_COMPLETION|TASK_COMPLETION_NOTIFICATION):.*?\]\s*/g, "")
            .trim();
          const allTags = [...existingTags.filter((t) => !t.startsWith("[TASK_COMPLETION_NOTIFICATION:")), notifTag];
          const tagsPrefix = allTags.length > 0 ? allTags.join("\n") + "\n\n" : "";
          const combinedNotesText = `${tagsPrefix}${[cleanOldNotes, ...autoGeneratedLogs, autoLogLine, completionText].filter(Boolean).join("\n\n")}`.trim();

          const targetStage = isNotAuthor ? deal.stage : "archived";

          const { error } = await supabase
            .from("crm_deals")
            .update({
              stage: targetStage,
              notes: combinedNotesText,
              updated_at: nowIso,
            })
            .eq("id", deal.id);

          if (error) throw error;

          await registerHistoryEntry(
            deal.id,
            "subtask_completed",
            `Vinculada concluída por ${userName}. Atualização: "${completionText}"`
          );

          // 2. Notifica a atividade principal vinculada e insere a conclusão com tag de notificação sem alterar o updated_at / coloração
          const parentInfo = getParentDealInfo(deal);
          const parentDeal = parentInfo?.deal || deals.find((d) => d.id === parentInfo?.id || getDealReqNumber(d, deals) === parentInfo?.reqNumber);

          if (parentDeal) {
            const subtaskCompletionObj: DealSubtaskCompletion = {
              id: crypto.randomUUID(),
              subtaskId: deal.id,
              subtaskTitle: cleanTitle,
              reqNumber: reqNum,
              userName: userName,
              user_id: user?.id || "",
              completionText: completionText,
              created_at: nowIso,
            };
            const completionTag = `[SUBTASK_COMPLETION:${JSON.stringify(subtaskCompletionObj)}]`;
            const parentAutoLog = `${userName} concluiu a vinculada "${cleanTitle}" (Nº ${reqNum}).`;
            const updatedParentNotes = parentDeal.notes
              ? `${completionTag}\n${parentDeal.notes}\n\n${parentAutoLog}`
              : `${completionTag}\n${parentAutoLog}`;

            await supabase
              .from("crm_deals")
              .update({
                notes: updatedParentNotes,
              })
              .eq("id", parentDeal.id);

            await registerHistoryEntry(
              parentDeal.id,
              "subtask_completed",
              `${parentAutoLog} Atualização: "${completionText}"`
            );

            setDeals((prev) =>
              prev.map((d) =>
                d.id === parentDeal.id
                  ? {
                      ...d,
                      notes: updatedParentNotes,
                    }
                  : d
              )
            );
          }

          setDeals((prev) =>
            prev.map((d) =>
              d.id === deal.id
                ? { ...d, stage: targetStage, notes: combinedNotesText, latest_update_author: userName, updated_at: nowIso }
                : d
            )
          );

          setNewComment("");
          setAutoGeneratedLogs([]);
          setSelectedDealForHistory(null);
          toast.success(
            isNotAuthor
              ? `Vinculada Nº ${reqNum} concluída! Notificação enviada ao autor para aceite.`
              : `Vinculada Nº ${reqNum} concluída e arquivada com sucesso!`
          );
        } catch (err: any) {
          toast.error(`Erro ao concluir vinculada: ${err.message || "Erro desconhecido"}`);
        }
      },
    });
  }

  // Arquivar / Concluir Atividade (Disponível para Tarefas, Concluídos e Perdidos)
  function handleArchiveDeal(deal: Deal) {
    const isLinkedSubtask = Boolean(getParentDealInfo(deal));
    const reqNum = getDealReqNumber(deal, deals);
    const typeLabel = isLinkedSubtask ? "Vinculada" : "Atividade";
    const cleanTitle = getCleanDealTitle(deal.title);

    // Se estiver em "archived", recupera o originStage anterior, senão usa o stage atual
    const originStage = deal.stage === "archived" ? getArchivedOriginStage(deal) : (deal.stage as "lead" | "completed" | "lost");
    const destColumnName = originStage === "completed" ? "Concluídos" : originStage === "lost" ? "Perdidos" : "Tarefas";
    const isNotAuthor = Boolean(deal.user_id && deal.user_id !== user?.id);

    setCrmConfirmConfig({
      isOpen: true,
      title: isNotAuthor ? `Finalizar ${typeLabel} Nº ${reqNum}` : `Arquivar ${typeLabel} Nº ${reqNum}`,
      description: isNotAuthor
        ? `Deseja finalizar a ${typeLabel} Nº ${reqNum} ("${cleanTitle}")?\n\nEla permanecerá visível na coluna até que o autor (${deal.creator_name || "Autor"}) aceite a conclusão.`
        : `Deseja arquivar a ${typeLabel} Nº ${reqNum} ("${cleanTitle}")?\n\nEla sairá do quadro ativo e ficará armazenada no rodapé de "ARQUIVADAS" da coluna de ${destColumnName} com todo o seu histórico preservado.`,
      confirmText: isNotAuthor ? "Finalizar e Notificar Autor" : "Arquivar Atividade",
      variant: isNotAuthor ? "info" : "danger",
      onConfirm: async () => {
        setCrmConfirmConfig(null);
        try {
          const nowIso = new Date().toISOString();
          const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
          const userNotes = newComment.trim();

          const existingTags = (deal.notes || "").match(/\[(QUOTE_FILE|PARENT_DEAL|WORK_LOG|WORK_ACTIVE|QUOTE_DATA|MENTION|MENTION_REPLY|SUBTASK_COMPLETION|TASK_COMPLETION_NOTIFICATION):.*?\]/g) || [];
          const cleanOldNotes = (deal.notes || "")
            .replace(/<!-- ORIGIN_STAGE:.*?-->/g, "")
            .replace(/\[(QUOTE_FILE|PARENT_DEAL|WORK_LOG|WORK_ACTIVE|QUOTE_DATA|MENTION|MENTION_REPLY|SUBTASK_COMPLETION|TASK_COMPLETION_NOTIFICATION):.*?\]\s*/g, "")
            .trim();

          const completionNotif: TaskCompletionNotification = {
            id: crypto.randomUUID(),
            deal_id: deal.id,
            deal_title: cleanTitle,
            req_number: reqNum,
            author_id: deal.user_id || "",
            author_name: deal.creator_name || "Autor",
            concluded_by_user_id: user?.id || "",
            concluded_by_user_name: userName,
            completion_notes: userNotes,
            created_at: nowIso,
            status: isNotAuthor ? "pending_acceptance" : "accepted",
          };
          const notifTag = `[TASK_COMPLETION_NOTIFICATION:${JSON.stringify(completionNotif)}]`;

          const combinedUserNotes = [cleanOldNotes, userNotes].filter(Boolean).join("\n\n");
          const allTags = [...existingTags.filter((t) => !t.startsWith("[TASK_COMPLETION_NOTIFICATION:")), notifTag];
          const tagsPrefix = allTags.length > 0 ? allTags.join("\n") + "\n\n" : "";
          const taggedNotes = `<!-- ORIGIN_STAGE:${originStage} -->\n${tagsPrefix}${combinedUserNotes}`.trim();

          const targetStage = isNotAuthor ? deal.stage : "archived";

          const { error } = await supabase
            .from("crm_deals")
            .update({
              stage: targetStage,
              notes: taggedNotes,
              updated_at: nowIso,
            })
            .eq("id", deal.id);

          if (error) throw error;

          await registerHistoryEntry(
            deal.id,
            isNotAuthor ? "completion_submitted" : "archived",
            isNotAuthor
              ? `${typeLabel} finalizada por ${userName}. Notificação de aceite enviada ao autor (${deal.creator_name || "Autor"}). Atualização: "${userNotes}"`
              : `${typeLabel} arquivada por ${userName}. [ORIGIN_STAGE:${originStage}]. Atualização final: "${userNotes}"`
          );

          // Notifica a atividade mãe se esta for uma subtarefa vinculada
          await notifyParentDealIfSubtask(deal, userNotes);

          setDeals((prev) =>
            prev.map((d) =>
              d.id === deal.id
                ? { ...d, stage: targetStage, notes: taggedNotes, latest_update_author: userName, updated_at: nowIso }
                : d
            )
          );

          setNewComment("");
          setSelectedDealForHistory(null);
          setIsTimelineOpen(false);
          toast.success(
            isNotAuthor
              ? `${typeLabel} Nº ${reqNum} finalizada! Notificação enviada ao autor para aceite.`
              : `${typeLabel} Nº ${reqNum} arquivada com sucesso!`
          );
        } catch (err: any) {
          toast.error("Erro ao processar atividade: " + (err.message || "Tente novamente"));
        }
      },
    });
  }

  // Aceitar Conclusão de Atividade (Autor ou Admin aceita o término e arquiva)
  async function handleAcceptCompletion(deal: Deal, notificationId?: string) {
    if (!user) return;
    const notifs = getDealCompletionNotifications(deal);
    const nowIso = new Date().toISOString();
    const userName = user?.user_metadata?.display_name || user?.email || "Autor";
    const reqNum = getDealReqNumber(deal, deals);

    const updatedNotifs = notifs.map((n) =>
      !notificationId || n.id === notificationId || n.status === "pending_acceptance"
        ? {
            ...n,
            status: "accepted" as const,
            accepted_at: nowIso,
            accepted_by_user_id: user.id,
            accepted_by_user_name: userName,
          }
        : n
    );

    const existingTags = (deal.notes || "").match(/\[(QUOTE_FILE|PARENT_DEAL|WORK_LOG|WORK_ACTIVE|QUOTE_DATA|MENTION|MENTION_REPLY|SUBTASK_COMPLETION):.*?\]/g) || [];
    const cleanOldNotes = (deal.notes || "")
      .replace(/<!-- ORIGIN_STAGE:.*?-->/g, "")
      .replace(/\[(QUOTE_FILE|PARENT_DEAL|WORK_LOG|WORK_ACTIVE|QUOTE_DATA|MENTION|MENTION_REPLY|SUBTASK_COMPLETION|TASK_COMPLETION_NOTIFICATION):.*?\]\s*/g, "")
      .trim();

    const notifTags = updatedNotifs.map((n) => `[TASK_COMPLETION_NOTIFICATION:${JSON.stringify(n)}]`);
    const allTags = [...existingTags, ...notifTags];
    const tagsPrefix = allTags.length > 0 ? allTags.join("\n") + "\n\n" : "";
    const originStage = getArchivedOriginStage(deal) || (deal.stage === "archived" ? "lead" : deal.stage);
    const autoLog = `${userName} aceitou a conclusão da atividade. Atividade arquivada e armazenada.`;
    const finalNotes = `<!-- ORIGIN_STAGE:${originStage} -->\n${tagsPrefix}${[cleanOldNotes, autoLog].filter(Boolean).join("\n\n")}`.trim();

    try {
      const { error } = await supabase
        .from("crm_deals")
        .update({
          stage: "archived",
          notes: finalNotes,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      await registerHistoryEntry(
        deal.id,
        "completion_accepted",
        `Conclusão aceita por ${userName}. Atividade Nº ${reqNum} arquivada e armazenada.`
      );

      const updatedDeal: Deal = {
        ...deal,
        stage: "archived",
        notes: finalNotes,
        latest_update_author: userName,
        updated_at: nowIso,
      };

      setDeals((prev) => prev.map((d) => (d.id === deal.id ? updatedDeal : d)));
      if (selectedDealForHistory && selectedDealForHistory.id === deal.id) {
        setSelectedDealForHistory(null);
        setIsTimelineOpen(false);
      }

      toast.success(`Conclusão da atividade Nº ${reqNum} aceita com sucesso!`);
    } catch (err: any) {
      toast.error("Erro ao aceitar conclusão: " + (err.message || "Tente novamente"));
    }
  }

  // Desarquivar / Restaurar Atividade ao seu Quadro de Origem (Tarefas, Concluídos ou Perdidos)
  async function handleUnarchiveDeal(deal: Deal) {
    const reqNum = getDealReqNumber(deal, deals);
    const originStage = getArchivedOriginStage(deal);
    if ((originStage === "completed" || originStage === "lost") && !isAdmin) {
      toast.error("Apenas administradores podem desarquivar atividades de Concluídos e Perdidos.");
      return;
    }
    const destColumnName =
      originStage === "lead" ? "Tarefas" : originStage === "completed" ? "Concluídos" : "Perdidos";
    const typeLabel =
      originStage === "lead" ? "Tarefa" : originStage === "completed" ? "Atividade Concluída" : "Atividade Perdida";

    try {
      const nowIso = new Date().toISOString();
      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";

      const { error } = await supabase
        .from("crm_deals")
        .update({ stage: originStage, updated_at: nowIso })
        .eq("id", deal.id);

      if (error) throw error;

      await registerHistoryEntry(
        deal.id,
        "unarchived",
        `${typeLabel} desarquivada e restaurada à coluna ${destColumnName} por ${userName}.`
      );

      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, stage: originStage, updated_at: nowIso }
            : d
        )
      );

      setSelectedDealForHistory(null);
      toast.success(`${typeLabel} Nº ${reqNum} restaurada para a coluna de ${destColumnName}!`);
    } catch (err: any) {
      toast.error("Erro ao desarquivar: " + (err.message || "Tente novamente"));
    }
  }

  // Cadastrar Novo Cliente no Modal Exclusivo
  async function handleSaveNewCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!inlineCompanyName.trim()) return toast.error("Informe o Nome da Empresa / Razão Social");

    const cleanDoc = inlineCustomerDoc.replace(/\D/g, "");
    if (!cleanDoc) return toast.error("Informe o CNPJ da empresa");
    if (cleanDoc.length !== 14) {
      return toast.error("O CNPJ deve ser preenchido por completo no formato 00.000.000/0000-00 (14 dígitos)");
    }

    if (!inlineContactName.trim()) return toast.error("Informe o Contato Principal");
    if (!inlineCustomerEmail.trim()) return toast.error("Informe o E-mail de Contato");

    const cleanPhone = inlineCustomerPhone.replace(/\D/g, "");
    if (!cleanPhone) return toast.error("Informe o Telefone / WhatsApp");
    if (cleanPhone.length !== 11) {
      return toast.error("O Telefone deve ser preenchido por completo no formato (XX) X XXXX-XXXX (11 dígitos)");
    }

    setIsSavingCustomer(true);
    try {
      const { data: newCust, error: newCustErr } = await supabase
        .from("crm_customers")
        .insert({
          company_name: inlineCompanyName.trim(),
          document: inlineCustomerDoc.trim(),
          name: inlineContactName.trim(),
          email: inlineCustomerEmail.trim(),
          phone: inlineCustomerPhone.trim(),
          user_id: user?.id,
        })
        .select()
        .single();

      if (newCustErr) throw newCustErr;

      setCustomers((prev) => [...prev, newCust]);
      setNewDealCustomerId(newCust.id);
      setIsNewCustomerModalOpen(false);
      setInlineCompanyName("");
      setInlineCustomerDoc("");
      setInlineContactName("");
      setInlineCustomerEmail("");
      setInlineCustomerPhone("");
      toast.success(`Cliente "${newCust.company_name || newCust.name}" cadastrado e selecionado!`);
    } catch (err: any) {
      toast.error("Erro ao cadastrar cliente: " + (err.message || "Tente novamente"));
    } finally {
      setIsSavingCustomer(false);
    }
  }

  // Iniciar Edição da Ficha Cadastral do Cliente (Exclusivo ADM)
  function handleStartEditCustomerCard() {
    if (!selectedCustomerForDetails || !isAdmin) return;
    setEditCustCompany(selectedCustomerForDetails.company_name || "");
    setEditCustName(selectedCustomerForDetails.name || "");
    setEditCustDoc(selectedCustomerForDetails.document || "");
    setEditCustEmail(selectedCustomerForDetails.email || "");
    setEditCustPhone(selectedCustomerForDetails.phone || "");
    setIsEditingCustomerCard(true);
  }

  // Salvar Alterações Cadastrais do Cliente (Exclusivo ADM)
  async function handleSaveCustomerCard(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCustomerForDetails || !isAdmin) return;
    if (!editCustCompany.trim() && !editCustName.trim()) {
      return toast.error("Informe a Razão Social ou o Nome do Cliente");
    }

    setIsSavingCustDetails(true);
    try {
      const updatedData = {
        company_name: editCustCompany.trim().toUpperCase() || null,
        name: editCustName.trim().toUpperCase() || editCustCompany.trim().toUpperCase(),
        document: editCustDoc.trim() || null,
        email: editCustEmail.trim() || null,
        phone: editCustPhone.trim() || null,
      };

      const { error } = await supabase
        .from("crm_customers")
        .update(updatedData)
        .eq("id", selectedCustomerForDetails.id);

      if (error) throw error;

      const updatedCustomer: Customer = {
        ...selectedCustomerForDetails,
        ...updatedData,
        company_name: updatedData.company_name || undefined,
        document: updatedData.document || undefined,
        email: updatedData.email || undefined,
        phone: updatedData.phone || undefined,
      };

      // Atualiza lista de clientes em memória
      setCustomers((prev) =>
        prev.map((c) => (c.id === selectedCustomerForDetails.id ? updatedCustomer : c))
      );

      // Atualiza o cliente aberto no modal
      setSelectedCustomerForDetails(updatedCustomer);
      setIsEditingCustomerCard(false);
      toast.success("Dados do cliente atualizados com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao atualizar dados do cliente: " + (err.message || "Tente novamente"));
    } finally {
      setIsSavingCustDetails(false);
    }
  }

  // Criar Requisição
  async function handleCreateDeal(e: React.FormEvent) {
    e.preventDefault();

    let targetCustomerId = newDealCustomerId || null;

    if (activeReqModal === "externa") {
      if (!targetCustomerId) return toast.error("Selecione ou cadastre um cliente");
    } else {
      if (!newDealDeadline) {
        return toast.error("Informe o prazo de execução da tarefa interna");
      }
    }

    if (!newDealTitle.trim()) return toast.error("Informe o título da requisição");
    const dealTitleWords = newDealTitle.trim().split(/\s+/).filter(Boolean);
    if (dealTitleWords.length > 6) {
      return toast.error(`O título deve conter no máximo 6 palavras (atualmente com ${dealTitleWords.length} palavras). Detalhe as informações no campo de instruções abaixo.`);
    }
    if (!newDealAssignedTo) return toast.error("O direcionamento ao responsável é obrigatório");
    if (!newDealNotes.trim()) return toast.error("As instruções da atividade são obrigatórias");

    const typePrefix =
      activeReqModal === "interna"
        ? "[TAREFA]"
        : "[ORÇAMENTO]";

    const fullTitle = `${typePrefix} ${newDealTitle.trim().toUpperCase()}`;

    // Apenas Tarefa nasce na coluna 'lead' (Tarefas). Orçamentos nascem em 'qualification' (Orçamentos).
    const initialStage = activeReqModal === "interna" ? "lead" : "qualification";

    const assignedProf = teamMembers.find((m) => m.id === newDealAssignedTo);
    const assignedName = assignedProf?.display_name || assignedProf?.email || "Responsável";

    try {
      const generatedReqNumber = generateNextReqNumber(deals);

      const { data: createdData, error } = await supabase
        .from("crm_deals")
        .insert({
          title: fullTitle,
          stage: initialStage,
          customer_id: targetCustomerId,
          user_id: user?.id,
          assigned_user_id: newDealAssignedTo,
          expected_close_date: newDealDeadline ? newDealDeadline : null,
          notes: newDealNotes.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Cria o primeiro registro no Histórico / Linha do Tempo
      try {
        await supabase.from("crm_deal_history").insert({
          deal_id: createdData.id,
          user_id: user?.id,
          user_name: user?.user_metadata?.display_name || user?.email || "Usuário",
          description: `Atividade criada e direcionada para ${assignedName}. Instruções: ${newDealNotes.trim()}`,
        });
      } catch (hErr) {
        console.warn("Aviso ao registrar histórico inicial:", hErr);
      }

      toast.success(
        activeReqModal === "interna"
          ? `Tarefa Nº ${generatedReqNumber} criada com sucesso para ${newDealDeadline.split("-").reverse().join("/")}!`
          : `Orçamento Nº ${generatedReqNumber} criado e direcionado com sucesso!`
      );

      const resolvedCust = customers.find((c) => c.id === targetCustomerId);
      const customerDisplayName =
        activeReqModal === "interna"
          ? "Uso Interno / Empresa"
          : resolvedCust?.company_name ||
            resolvedCust?.name ||
            inlineCompanyName ||
            inlineContactName ||
            "Cliente não informado";

      // Adiciona a nova atividade no final da ordem da coluna (na base da coluna)
      setStageCustomOrders((prevOrders) => {
        const currentStageOrder = prevOrders[initialStage] || [];
        const updatedOrder = [...currentStageOrder.filter((id) => id !== createdData.id), createdData.id];
        const nextOrders = {
          ...prevOrders,
          [initialStage]: updatedOrder,
        };
        try {
          localStorage.setItem("mykaflow_crm_stage_order", JSON.stringify(nextOrders));
        } catch (e) {
          console.error("Erro ao salvar ordem ao criar atividade:", e);
        }
        return nextOrders;
      });

      setDeals((prev) => [
        ...prev,
        {
          ...createdData,
          req_number: createdData.req_number || generatedReqNumber,
          creator_name: user?.user_metadata?.display_name || user?.email || "Você",
          latest_update_author: user?.user_metadata?.display_name || user?.email || "Você",
          customer_name: customerDisplayName,
          assigned_user_name: assignedName,
        },
      ]);

      setActiveReqModal(null);
    } catch (err: any) {
      toast.error("Erro ao criar requisição: " + (err.message || "Tente novamente"));
    }
  }

  function handleMoveStage(deal: Deal, newStage: Deal["stage"]) {
    if (deal.stage === newStage) return;

    const isStandaloneInternal =
      (deal.title.includes("[REQ. INTERNA]") || deal.stage === "lead") &&
      !deal.title.includes("[TAREFA]") &&
      !deal.notes?.includes("[PARENT_DEAL:");

    // 1. Tarefa interna avulsa nunca pode ser movida para etapas de orçamentos
    if (isStandaloneInternal && newStage !== "lead") {
      return toast.error("Uma tarefa interna avulsa não pode ser movida para as colunas de orçamentos.");
    }

    // 2. Orçamento nunca pode ser movido para a coluna de Tarefas
    if (!isStandaloneInternal && !deal.title.includes("[TAREFA]") && newStage === "lead") {
      return toast.error("Um orçamento não pode ser movido para a coluna de Tarefas.");
    }

    const currentStageId = deal.stage === "proposal" ? "negotiation" : deal.stage;
    const currentIndex = STAGES.findIndex((s) => s.id === currentStageId);
    const targetIndex = STAGES.findIndex((s) => s.id === newStage);

    // Regra 1: Não é permitido retroceder de coluna/etapa
    if (currentIndex !== -1 && targetIndex < currentIndex) {
      return toast.error("Uma atividade não pode retroceder de coluna.");
    }

    // Regra 2: Um orçamento ou atividade não pode pular etapas (não pode passar direto para contratos ou perdidos sem ter passado por negociações)
    if (currentIndex !== -1 && targetIndex > currentIndex + 1) {
      const isWonToLostOrCompleted = currentStageId === "won" && (newStage === "lost" || newStage === "completed");
      if (!isWonToLostOrCompleted) {
        const nextAllowedTitle = STAGES[currentIndex + 1]?.title || "próxima etapa";
        return toast.error(
          `Não é permitido pular etapas. A atividade deve avançar para "${nextAllowedTitle}" antes de prosseguir.`
        );
      }
    }

    // Regra 3: Tarefa/Orçamento só pode avançar para a etapa NEGOCIAÇÕES se o orçamento oficial estiver anexado
    if (newStage === "negotiation") {
      const parentInfo = getParentDealInfo(deal);
      const parentDeal = parentInfo?.deal || deals.find((d) => d.id === parentInfo?.id);
      const hasQuoteAttached = Boolean(
        getDealQuoteFile(deal, dealHistoryList) ||
        (parentDeal && getDealQuoteFile(parentDeal))
      );

      if (!hasQuoteAttached) {
        return toast.error(
          "Não é possível mover para a etapa NEGOCIAÇÕES sem o orçamento anexado na atividade. Anexe o orçamento antes de prosseguir."
        );
      }
    }

    // Fecha qualquer modal de histórico aberto antes de abrir o modal de movimentação
    setSelectedDealForHistory(null);

    setMovingDealState({
      deal,
      targetStage: newStage,
      updateText: "",
      updatedNotes: deal.notes || "",
      reassignTo: deal.assigned_user_id || "",
    });
  }

  function handleReorderDealWithinStage(
    stageId: Deal["stage"],
    sourceDealId: string,
    targetDealId: string,
    position: "before" | "after",
    showToast: boolean = false
  ) {
    if (sourceDealId === targetDealId) return;

    setStageCustomOrders((prev) => {
      const currentStageDeals = visibleDeals.filter((d) => d.stage === stageId);
      const existingOrder = prev[stageId] || [];

      // Ordenar conforme ordem salva atual
      const sorted = [...currentStageDeals].sort((a, b) => {
        const isPendingA = isDealPendingAuthorAcceptance(a);
        const isPendingB = isDealPendingAuthorAcceptance(b);
        if (!isPendingA && isPendingB) return -1;
        if (isPendingA && !isPendingB) return 1;

        const indexA = existingOrder.indexOf(a.id);
        const indexB = existingOrder.indexOf(b.id);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        const timeA = new Date(a.created_at || a.updated_at || 0).getTime();
        const timeB = new Date(b.created_at || b.updated_at || 0).getTime();
        return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
      });

      const dealIds = sorted.map((d) => d.id);
      const sourceIdx = dealIds.indexOf(sourceDealId);
      const targetIdx = dealIds.indexOf(targetDealId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;

      // Se já está na posição relativa correta, não reprocessa
      if (position === "before" && targetIdx === sourceIdx + 1) return prev;
      if (position === "after" && targetIdx === sourceIdx - 1) return prev;

      dealIds.splice(sourceIdx, 1);
      const newTargetIdx = dealIds.indexOf(targetDealId);
      if (newTargetIdx === -1) {
        dealIds.push(sourceDealId);
      } else {
        const insertIdx = position === "before" ? newTargetIdx : newTargetIdx + 1;
        dealIds.splice(insertIdx, 0, sourceDealId);
      }

      const updated = {
        ...prev,
        [stageId]: dealIds,
      };

      try {
        localStorage.setItem("mykaflow_crm_stage_order", JSON.stringify(updated));
      } catch (e) {
        console.error("Erro ao salvar ordem de prioridades:", e);
      }

      return updated;
    });

    if (showToast) {
      toast.success("Prioridade atualizada!", { duration: 1500 });
    }
  }

  async function handleConfirmMoveStage(e: React.FormEvent) {
    e.preventDefault();
    if (!movingDealState) return;

    const { deal, targetStage, updateText, updatedNotes, reassignTo } = movingDealState;

    if (!updateText.trim()) {
      return toast.error("É obrigatório descrever a atualização das informações para mover a requisição.");
    }

    if (targetStage === "negotiation") {
      const parentInfo = getParentDealInfo(deal);
      const parentDeal = parentInfo?.deal || deals.find((d) => d.id === parentInfo?.id);
      const hasQuoteAttached = Boolean(
        getDealQuoteFile(deal, dealHistoryList) ||
        (parentDeal && getDealQuoteFile(parentDeal))
      );

      if (!hasQuoteAttached) {
        return toast.error(
          "Não é possível mover para a etapa NEGOCIAÇÕES sem o orçamento oficial anexado na atividade. Anexe o orçamento antes de prosseguir."
        );
      }
    }

    setIsSavingMove(true);
    try {
      const nowIso = new Date().toISOString();
      const currentAssigned = teamMembers.find((m) => m.id === deal.assigned_user_id)?.display_name || "Anterior";
      const newAssignedMember = teamMembers.find((m) => m.id === reassignTo);
      const newAssignedName = newAssignedMember?.display_name || newAssignedMember?.email || deal.assigned_user_name || "Novo Responsável";
      const isReassigned = Boolean(reassignTo && reassignTo !== deal.assigned_user_id);
      const isReturnedToCreator = Boolean(
        isReassigned && deal.user_id && reassignTo === deal.user_id && deal.assigned_user_id !== deal.user_id
      );

      const oldStageTitle = STAGES.find((s) => s.id === deal.stage)?.title || deal.stage;
      const newStageTitle = STAGES.find((s) => s.id === targetStage)?.title || targetStage;
      const targetAssignedUserId = isReassigned ? (reassignTo || null) : (deal.assigned_user_id || null);

      // Preserva tags de arquivos anexados e atividades vinculadas
      const existingQuoteTag = deal.notes?.match(/\[QUOTE_FILE:.*?\]/)?.[0] || (deal.quote_file_url ? `[QUOTE_FILE:${JSON.stringify({ url: deal.quote_file_url, name: deal.quote_file_name || "orcamento_oficial", uploadedAt: deal.quote_file_uploaded_at || nowIso })}]` : "");
      const existingParentTag = deal.notes?.match(/\[PARENT_DEAL:.*?\]/)?.[0] || "";
      const cleanUpdate = updateText.trim();
      const metaTags = [existingQuoteTag, existingParentTag].filter(Boolean).join("\n");
      const latestActivityNotes = metaTags ? `${metaTags}\n${cleanUpdate}`.trim() : cleanUpdate;

      const { error } = await supabase
        .from("crm_deals")
        .update({
          stage: targetStage,
          notes: latestActivityNotes,
          assigned_user_id: targetAssignedUserId,
          updated_at: nowIso,
        })
        .eq("id", deal.id);

      if (error) throw error;

      let desc = `Mudança de etapa: "${oldStageTitle}" ➔ "${newStageTitle}". Atualização: "${updateText.trim()}"`;
      if (isReturnedToCreator) {
        desc += ` (Devolvido ao criador ${newAssignedName})`;
      } else if (isReassigned) {
        desc += ` (Encaminhado para ${newAssignedName})`;
      }

      await registerHistoryEntry(
        deal.id,
        "status_changed",
        desc,
        oldStageTitle,
        newStageTitle
      );

      if (targetStage === "won") {
        await notifyParentDealIfSubtask(deal, updateText);
      }

      // Se a atividade movida possuir tarefas vinculadas, atualiza também a etapa das tarefas vinculadas para acompanharem a atividade mãe na mesma coluna
      const linkedSubtaskIds = new Set<string>();
      deals.forEach((d) => {
        const pInfo = getParentDealInfo(d);
        if (pInfo?.id === deal.id || (pInfo?.reqNumber && pInfo.reqNumber === getDealReqNumber(deal, deals))) {
          linkedSubtaskIds.add(d.id);
        }
      });

      if (linkedSubtaskIds.size > 0) {
        for (const subId of Array.from(linkedSubtaskIds)) {
          try {
            await supabase
              .from("crm_deals")
              .update({ stage: targetStage, updated_at: nowIso })
              .eq("id", subId);
          } catch (subErr) {
            console.warn("Aviso ao mover subtarefa vinculada com a mãe:", subErr);
          }
        }
      }

      setDeals((prev) =>
        prev.map((d) => {
          if (d.id === deal.id) {
            return {
              ...d,
              stage: targetStage,
              notes: latestActivityNotes || d.notes,
              assigned_user_id: targetAssignedUserId,
              assigned_user_name: isReassigned ? newAssignedName : d.assigned_user_name,
              updated_at: nowIso,
            };
          }
          if (linkedSubtaskIds.has(d.id)) {
            return {
              ...d,
              stage: targetStage,
              updated_at: nowIso,
            };
          }
          return d;
        })
      );

      // Adiciona a atividade movida na base da nova etapa
      setStageCustomOrders((prevOrders) => {
        const currentStageOrder = prevOrders[targetStage] || [];
        const updatedOrder = [...currentStageOrder.filter((id) => id !== deal.id), deal.id];
        const nextOrders = {
          ...prevOrders,
          [targetStage]: updatedOrder,
          [deal.stage]: (prevOrders[deal.stage] || []).filter((id) => id !== deal.id),
        };
        try {
          localStorage.setItem("mykaflow_crm_stage_order", JSON.stringify(nextOrders));
        } catch (e) {
          console.error("Erro ao salvar ordem ao mover de etapa:", e);
        }
        return nextOrders;
      });

      setMovingDealState(null);
      toast.success(`Requisição atualizada e movida para "${newStageTitle}"!`);
    } catch (err: any) {
      toast.error("Erro ao salvar atualização e mover etapa: " + (err.message || "Tente novamente"));
    } finally {
      setIsSavingMove(false);
    }
  }

  async function handleAddHistoryOrReassign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDealForHistory) return;

    if (!isAdmin && selectedDealForHistory.assigned_user_id !== user?.id) {
      return toast.error("Apenas o responsável pela atividade ou o Administrador podem inserir novas atualizações.");
    }

    if (!newComment.trim()) {
      return toast.error("É obrigatório preencher o campo de atualização com o andamento da atividade.");
    }

    setIsSavingUpdate(true);
    const deal = selectedDealForHistory;
    const nowIso = new Date().toISOString();
    const currentAssigned = teamMembers.find((m) => m.id === deal.assigned_user_id)?.display_name || "Anterior";
    const newAssignedMember = teamMembers.find((m) => m.id === reassignTo);
    const newAssignedName = newAssignedMember?.display_name || newAssignedMember?.email || "Novo Responsável";

    try {
      const isReassigned = Boolean(reassignTo && reassignTo !== deal.assigned_user_id);
      const isReturnedToCreator = Boolean(
        isReassigned && deal.user_id && reassignTo === deal.user_id && deal.assigned_user_id !== deal.user_id
      );

      const targetStage = stageToMove || deal.stage;
      const isStageChanged = Boolean(stageToMove && stageToMove !== deal.stage);

      const combinedNotesText = [...autoGeneratedLogs, newComment.trim()].filter(Boolean).join("\n\n");

      // Detecção e criação de Menções (@usuario)
      const mentionTags: string[] = [];
      const commentRaw = newComment.trim();
      const currentUserName = user?.user_metadata?.display_name || user?.email || "Você";

      teamMembers.forEach((member) => {
        const memberName = member.display_name || member.email || "";
        const firstName = memberName.split(" ")[0];
        
        // Verifica se o texto contém @Nome, @NomeCompleto ou @Email
        const mentionRegex = new RegExp(`@(${escapeRegExp(memberName)}|${escapeRegExp(firstName)}|${escapeRegExp(member.email || "")})\\b`, "i");
        if (mentionRegex.test(commentRaw)) {
          const mentionObj: DealMention = {
            id: crypto.randomUUID(),
            deal_id: deal.id,
            author_id: user.id,
            author_name: currentUserName,
            mentioned_user_id: member.id,
            mentioned_user_name: memberName,
            content: commentRaw,
            created_at: nowIso,
            read_by_user: false,
          };
          mentionTags.push(`[MENTION:${JSON.stringify(mentionObj)}]`);
        }
      });

      const updatePayload: any = { updated_at: nowIso };
      if (isStageChanged) updatePayload.stage = targetStage;
      if (isReassigned) updatePayload.assigned_user_id = reassignTo;
      
      // Preserva tags de metadados existentes (QUOTE_FILE, PARENT_DEAL, WORK_LOG, MENTION_REPLY, etc.)
      const existingTags = (deal.notes || "").match(/\[(QUOTE_FILE|PARENT_DEAL|WORK_LOG|WORK_ACTIVE|QUOTE_DATA|MENTION|MENTION_REPLY):.*?\]/g) || [];
      const allNewTags = [...existingTags, ...mentionTags];
      const uniqueTags = Array.from(new Set(allNewTags));
      const tagsBlock = uniqueTags.join("\n");

      updatePayload.notes = tagsBlock ? `${tagsBlock}\n${combinedNotesText}`.trim() : combinedNotesText;

      await supabase
        .from("crm_deals")
        .update(updatePayload)
        .eq("id", deal.id);

      let desc = "";
      if (isReturnedToCreator) {
        desc = `🔄 ALERTA ADM: Atividade devolvida ao criador original (${newAssignedName}) por ${currentAssigned}.${
          combinedNotesText ? ` Motivo: "${combinedNotesText}"` : ""
        }`;
      } else if (isReassigned && combinedNotesText) {
        desc = `Encaminhado de ${currentAssigned} para ${newAssignedName}. Motivo/Instrução: "${combinedNotesText}"`;
      } else if (isReassigned) {
        desc = `Encaminhado de ${currentAssigned} para ${newAssignedName}.`;
      } else {
        desc = `Atualização de andamento: "${combinedNotesText}"`;
      }

      const actionType = isReturnedToCreator
        ? "returned_to_creator"
        : isStageChanged
        ? "stage_change"
        : isReassigned
        ? "reassigned"
        : "comment";

      await registerHistoryEntry(
        deal.id,
        actionType,
        desc,
        currentAssigned,
        newAssignedName
      );

      const newHistoryItem: DealHistoryItem = {
        id: crypto.randomUUID(),
        deal_id: deal.id,
        user_name: user?.user_metadata?.display_name || user?.email || "Você",
        action_type: actionType,
        description: desc,
        created_at: nowIso,
      };

      if (isReturnedToCreator) {
        setReturnedHistoryList((prev) => [newHistoryItem, ...prev]);
      }

      setDealHistoryList((prev) => [newHistoryItem, ...prev]);
      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? {
                ...d,
                stage: targetStage,
                notes: combinedNotesText ? combinedNotesText : d.notes,
                latest_update_author: combinedNotesText ? currentUserName : (d.latest_update_author || currentUserName),
                assigned_user_id: isReassigned ? reassignTo : d.assigned_user_id,
                assigned_user_name: isReassigned ? newAssignedName : d.assigned_user_name,
                updated_at: nowIso,
              }
            : d
        )
      );

      setSelectedDealForHistory(null);
      setNewComment("");
      setAutoGeneratedLogs([]);
      setStageToMove(null);
      toast.success(
        isReturnedToCreator
          ? `Atividade devolvida ao criador (${newAssignedName})! Alerta gerado para ADM.`
          : isReassigned
            ? `Atividade encaminhada para ${newAssignedName} com sucesso!`
            : "Atualização salva com sucesso!"
      );
    } catch (err: any) {
      toast.error("Erro ao registrar atualização: " + err.message);
    } finally {
      setIsSavingUpdate(false);
    }
  }

  async function handleConfirmWonContract() {
    if (!contractModalDeal) return;
    setIsSyncing(true);

    try {
      const deal = contractModalDeal;
      const totalVal = Number(deal.value) || 0;
      const installmentsCount = Math.max(1, contractInstallments);
      const installmentVal = totalVal / installmentsCount;
      const nowIso = new Date().toISOString();

      await supabase.from("crm_deals").update({ stage: "won", updated_at: nowIso }).eq("id", deal.id);

      await registerHistoryEntry(
        deal.id,
        "status_changed",
        `Requisição fechada/ganha com sucesso por ${user?.user_metadata?.display_name || user?.email}. Contrato integrado no Fluxo de Caixa.`
      );

      const { data: contract } = await supabase
        .from("crm_contracts")
        .insert({
          deal_id: deal.id,
          customer_id: deal.customer_id,
          total_value: totalVal,
          start_date: contractStartDate,
          installments_count: installmentsCount,
          billing_type: installmentsCount > 1 ? "installments" : "single",
          status: "active",
          user_id: user?.id,
        })
        .select()
        .single();

      const startDateObj = new Date(contractStartDate);
      for (let i = 0; i < installmentsCount; i++) {
        const dueDate = new Date(startDateObj);
        dueDate.setMonth(dueDate.getMonth() + i);
        const dateStr = dueDate.toISOString().split("T")[0];

        const desc =
          installmentsCount > 1
            ? `Receita Contrato: ${deal.title} (${deal.customer_name}) [Parcela ${i + 1}/${installmentsCount}]`
            : `Receita Contrato: ${deal.title} (${deal.customer_name})`;

        const { data: txData, error: txErr } = await supabase
          .from("transactions")
          .insert({
            user_id: user?.id,
            type: "income",
            nature: "variable",
            category: "Contratos / Vendas Comercial",
            description: desc,
            amount: Number(installmentVal.toFixed(2)),
            occurred_on: dateStr,
          })
          .select()
          .single();

        if (!txErr && contract && txData) {
          await supabase.from("crm_contract_installments").insert({
            contract_id: contract.id,
            installment_number: i + 1,
            amount: installmentVal,
            due_date: dateStr,
            transaction_id: txData.id,
            status: "pending",
          });
        }
      }

      const oldStageTitle = STAGES.find((s) => s.id === deal.stage)?.title || deal.stage;
      await registerHistoryEntry(
        deal.id,
        "status_changed",
        `🎉 Contrato Fechado! Movido de "${oldStageTitle}" para "CONTRATOS" por ${user?.user_metadata?.display_name || user?.email}.`,
        oldStageTitle,
        "CONTRATOS"
      );

      toast.success(
        `🎉 Contrato Fechado! Lançado ${installmentsCount}x de ${fmtCurrency(installmentVal)} no Fluxo de Caixa.`
      );
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage: "won", updated_at: nowIso } : d)));
      setContractModalDeal(null);
    } catch (err: any) {
      toast.error("Erro na integração: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  }

  // Filtro de Visibilidade por Permissão:
  // - Administrador: visualiza todas as atividades de todos os usuários
  // - Usuário comum: visualiza as atividades sob sua responsabilidade (ativas ou aguardando aceite) e as atividades que criou que estão aguardando seu aceite
  const visibleDeals = useMemo(() => {
    if (role === "admin") {
      return deals;
    }
    return deals.filter((d) => {
      const isAssigned = d.assigned_user_id === user?.id;
      const isAuthor = (d as any).user_id === user?.id;
      const isPending = isDealPendingAuthorAcceptance(d);

      // Se o usuário é o responsável: vê enquanto ativa e quando estiver aguardando aceite
      if (isAssigned) return true;

      // Se o usuário é o autor: vê quando ela foi finalizada/armazenada pelo responsável aguardando seu aceite
      if (isAuthor && isPending) return true;

      return false;
    });
  }, [deals, role, user?.id]);

  // Alertas automáticos para Administradores (apenas requisições internas ativas possuem prazo)
  const overdueAlerts = useMemo(() => {
    return deals.filter(
      (d) =>
        (d.title.includes("[REQ. INTERNA]") || d.stage === "lead") &&
        d.expected_close_date &&
        d.stage !== "won" &&
        d.stage !== "lost" &&
        d.stage !== "archived" &&
        !isDealPendingAuthorAcceptance(d) &&
        getDeadlineInfo(d.expected_close_date).diffDays !== undefined &&
        getDeadlineInfo(d.expected_close_date).diffDays! < 0
    );
  }, [deals]);

  const returnedAlerts = useMemo(() => {
    const returnedDealIds = new Set(returnedHistoryList.map((h) => h.deal_id));
    return deals.filter(
      (d) =>
        (returnedDealIds.has(d.id) ||
          (d.user_id && d.assigned_user_id === d.user_id && d.notes?.includes("[DEVOLVIDA]"))) &&
        d.stage !== "won" &&
        d.stage !== "lost" &&
        d.stage !== "archived"
    );
  }, [deals, returnedHistoryList]);

  const totalAdminAlerts = useMemo(() => {
    return overdueAlerts.length + returnedAlerts.length;
  }, [overdueAlerts.length, returnedAlerts.length]);

  const totalArchivedCount = useMemo(() => {
    return visibleDeals.filter(
      (d) => d.stage === "archived" && !getParentDealInfo(d)
    ).length;
  }, [visibleDeals]);

  const archivedDealsList = useMemo(() => {
    return visibleDeals.filter((d) => {
      if (d.stage !== "archived" || getParentDealInfo(d)) return false;

      if (archivedFilterStage !== "ALL") {
        const origin = getArchivedOriginStage(d);
        if (origin !== archivedFilterStage) return false;
      }

      // Filtro Temporal: Data / Semana / Mês / Data Específica
      if (archivedPeriodFilter !== "ALL") {
        const rawDateStr = d.updated_at || d.created_at;
        const targetDate = new Date(rawDateStr);
        const now = new Date();

        if (archivedPeriodFilter === "today") {
          const isToday =
            targetDate.getFullYear() === now.getFullYear() &&
            targetDate.getMonth() === now.getMonth() &&
            targetDate.getDate() === now.getDate();
          if (!isToday) return false;
        } else if (archivedPeriodFilter === "week") {
          // Últimos 7 dias
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          sevenDaysAgo.setHours(0, 0, 0, 0);
          if (targetDate.getTime() < sevenDaysAgo.getTime()) return false;
        } else if (archivedPeriodFilter === "month") {
          const isThisMonth =
            targetDate.getFullYear() === now.getFullYear() &&
            targetDate.getMonth() === now.getMonth();
          if (!isThisMonth) return false;
        } else if (archivedPeriodFilter === "custom" && archivedCustomDate) {
          const dealDateStr = targetDate.toISOString().split("T")[0];
          if (dealDateStr !== archivedCustomDate) return false;
        }
      }

      if (archivedSearchTerm.trim()) {
        const term = archivedSearchTerm.toLowerCase();
        const title = d.title.toLowerCase();
        const reqNum = getDealReqNumber(d, deals).toLowerCase();
        const notes = (d.notes || "").toLowerCase();
        const assigned = (d.assigned_user_name || "").toLowerCase();
        const custName = (d.customer_name || "").toLowerCase();

        return (
          title.includes(term) ||
          reqNum.includes(term) ||
          notes.includes(term) ||
          assigned.includes(term) ||
          custName.includes(term)
        );
      }

      return true;
    });
  }, [visibleDeals, archivedSearchTerm, archivedFilterStage, archivedPeriodFilter, archivedCustomDate, deals]);

  // Lista de Menções e Respostas do Usuário Logado
  const userMentionsData = useMemo(() => {
    if (!user) return { all: [], unreadCount: 0 };
    const myId = user.id;
    const allMentions: Array<{ mention: DealMention; deal: Deal; replies: DealMentionReply[] }> = [];

    deals.forEach((deal) => {
      const mentions = getDealMentions(deal);
      const allReplies = getDealMentionReplies(deal);

      mentions.forEach((m) => {
        if (m.mentioned_user_id === myId) {
          const repliesForThis = allReplies.filter((r) => r.mention_id === m.id);
          allMentions.push({
            mention: m,
            deal,
            replies: repliesForThis,
          });
        }
      });
    });

    allMentions.sort(
      (a, b) => new Date(b.mention.created_at).getTime() - new Date(a.mention.created_at).getTime()
    );

    const unreadCount = allMentions.filter((item) => !item.mention.read_by_user).length;

    return {
      all: allMentions,
      unreadCount,
    };
  }, [deals, user]);

  // Notificações de Conclusão direcionadas ao Usuário Logado (Autor da atividade)
  const userNotificationsData = useMemo(() => {
    if (!user) return { all: [], pendingCount: 0 };
    const myId = user.id;
    const allNotifs: Array<{ notification: TaskCompletionNotification; deal: Deal }> = [];

    deals.forEach((deal) => {
      const notifs = getDealCompletionNotifications(deal);
      notifs.forEach((n) => {
        if (n.author_id === myId || (!n.author_id && deal.user_id === myId)) {
          allNotifs.push({
            notification: n,
            deal,
          });
        }
      });
    });

    allNotifs.sort(
      (a, b) => new Date(b.notification.created_at).getTime() - new Date(a.notification.created_at).getTime()
    );

    const pendingCount = allNotifs.filter((item) => item.notification.status === "pending_acceptance").length;

    return {
      all: allNotifs,
      pendingCount,
    };
  }, [deals, user]);

  const totalInboxUnreadCount = userNotificationsData.pendingCount + userMentionsData.unreadCount;

  const pipelineMetrics = useMemo(() => {
    // Apenas orçamentos primários comerciais (desconsidera coluna de tarefas e tarefas vinculadas)
    const isCommercialQuote = (d: Deal) => {
      if (d.stage === "lead") return false;
      if (d.stage === "archived") return false;
      if (d.stage === "completed") return false;
      if (d.title.toUpperCase().includes("[REQ. INTERNA]")) return false;
      if (d.title.toUpperCase().includes("[TAREFA]")) return false;
      if (d.notes && d.notes.includes("[PARENT_DEAL:")) return false;
      return true;
    };

    const commercialDeals = visibleDeals.filter(isCommercialQuote);

    // Média de dias por coluna
    const calculateStageAvg = (stageId: Deal["stage"]) => {
      const stageDeals = commercialDeals.filter((d) => d.stage === stageId);
      if (stageDeals.length === 0) return { count: 0, avgDays: 0, deals: [] };
      const totalDays = stageDeals.reduce((acc, d) => {
        const days = getEffectiveCalendarDays(d.created_at);
        return acc + days;
      }, 0);
      return {
        count: stageDeals.length,
        avgDays: Math.round((totalDays / stageDeals.length) * 10) / 10,
        deals: stageDeals,
      };
    };

    const qualification = calculateStageAvg("qualification");
    const negotiation = calculateStageAvg("negotiation");
    const won = calculateStageAvg("won");
    const lost = calculateStageAvg("lost");

    return {
      totalCommercial: commercialDeals.length,
      qualification,
      negotiation,
      won,
      lost,
    };
  }, [visibleDeals]);

  // Helper para obter atividades na visão ativa atual (respeitando o filtro de usuário selecionado)
  const getStageActiveViewDeals = (stageId: string) => {
    const effectiveUser = internalFilterUser === "ME" ? (user?.id || "ALL") : internalFilterUser;
    let list = (visibleDeals || []).filter((d) => d.stage === stageId);
    if (effectiveUser !== "ALL") {
      list = list.filter((d) => isDealUserMatching(d, effectiveUser));
    }
    return list;
  };

  // Inicialização inteligente e atualização por visão: Abre colunas com atividades e recolhe as vazias na visão atual
  useEffect(() => {
    if (!visibleDeals || loading) return;
    const initialCollapsed: Record<string, boolean> = {};
    STAGES.forEach((stage) => {
      const count = getStageActiveViewDeals(stage.id).length;
      initialCollapsed[stage.id] = count === 0;
    });
    setCollapsedStages(initialCollapsed);
    setUserInitializedStages(true);
  }, [visibleDeals, loading, internalFilterUser, user?.id]);

  const toggleCollapseStage = (stageId: string) => {
    const dealsInView = getStageActiveViewDeals(stageId);
    const isCurrentlyCollapsed = Boolean(collapsedStages[stageId]);

    // Se estiver aberta e tiver atividades na visão atual, avisa
    if (!isCurrentlyCollapsed && dealsInView.length > 0) {
      toast.info("Colunas com atividades na sua visão permanecem abertas.");
      return;
    }

    setCollapsedStages((prev) => ({
      ...prev,
      [stageId]: !prev[stageId],
    }));
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent glow" />
          <p className="font-mono text-sm tracking-widest text-muted-foreground uppercase animate-pulse">
            Carregando Comercial...
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const effectiveFilterUser = internalFilterUser === "ME" ? (user?.id || "ALL") : internalFilterUser;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        onClick={() => {
          if (isolatedStageId) setIsolatedStageId(null);
        }}
        className="relative z-10 h-screen max-h-screen flex flex-col overflow-hidden px-4 pt-3 pb-3 md:px-6"
      >
      {/* Header Principal com Tag Centralizada no Topo */}
      <header className="shrink-0 mb-1 flex items-center justify-between pb-0 relative">
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/"
            className="btn-ghost-neon h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white transition-all cursor-pointer shadow-sm hover:scale-105"
            title="Voltar ao Seletor de Módulos (Hub Inicial)"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div
            className="flex flex-col select-none justify-center focus:outline-none"
          >
            <svg
              className="w-[220px] sm:w-[250px] h-[26px] overflow-visible select-none drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]"
              viewBox="0 0 265 26"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text
                x="0"
                y="21"
                className="font-saira-stencil"
                fontSize="22"
                fill="#22d3ee"
                textLength="265"
                lengthAdjust="spacing"
              >
                GESTÃO COMERCIAL
              </text>
            </svg>
          </div>

          {/* Seletor de Usuários / Visão do Quadro Kanban Integrado no Ícone do Usuário */}
          {(() => {
            const isMe = effectiveFilterUser === user?.id;
            const isAll = effectiveFilterUser === "ALL";
            const selectedMember = teamMembers.find((m) => m.id === effectiveFilterUser);
            const myMember = teamMembers.find((m) => m.id === user?.id);

            // Garante que o administrador sempre tenha o perfil ADM no seu quadro
            const myRole = isAdmin ? "admin" : (role || myMember?.role || "user");
            const myTheme = getUserRoleTheme(myRole, user?.email);

            const memberRole = selectedMember
              ? (selectedMember.id === user?.id && isAdmin ? "admin" : selectedMember.role)
              : myRole;
            const memberTheme = selectedMember 
              ? getUserRoleTheme(memberRole, selectedMember.email) 
              : myTheme;

            const currentTheme = isMe
              ? myTheme
              : isAll
              ? { bg: "bg-sky-500/20", text: "text-sky-300", border: "border-sky-500/50", iconColor: "text-sky-400" }
              : memberTheme;

            const displayNameTitle = isAll
              ? "QUADRO GERAL"
              : isMe
              ? (user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email || "Você")
              : (selectedMember?.display_name || selectedMember?.email || "Colaborador");
            const firstName = isAll ? "QUADRO GERAL" : getFirstName(displayNameTitle);

            const targetUserId = isAll ? user?.id : effectiveFilterUser;
            const activeDeal = deals.find((d) => {
              const worker = getDealActiveWorker(d);
              return Boolean(worker && worker.userId === targetUserId);
            });
            const activeWorker = activeDeal ? getDealActiveWorker(activeDeal) : null;
            const activeReqNumber = activeDeal ? getDealReqNumber(activeDeal, deals) : null;

            return (
              <div className="relative user-board-selector flex items-center gap-2.5 pl-3 border-l border-white/10 animate-in fade-in select-none">
                {/* Botão Ícone de Usuário que abre o Menu de Quadros */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBoardSelectorOpen((prev) => !prev);
                  }}
                  className={`relative h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 transition-all cursor-pointer shadow-md hover:scale-105 group ${
                    isBoardSelectorOpen
                      ? "ring-2 ring-sky-400 border-sky-400 bg-sky-500/30 scale-105 shadow-[0_0_20px_rgba(56,189,248,0.5)]"
                      : activeWorker
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:border-emerald-400"
                      : `${currentTheme.bg} ${currentTheme.text} ${currentTheme.border} hover:border-white/40`
                  }`}
                  title="Clique para alternar a visão do quadro (Meu Quadro / Geral / Colaboradores)"
                >
                  {isAll ? (
                    <Users className="h-4.5 w-4.5 text-sky-400 group-hover:scale-110 transition-transform" />
                  ) : isMe ? (
                    <UserCheck className={`h-4.5 w-4.5 ${myTheme.iconColor} group-hover:scale-110 transition-transform`} />
                  ) : (
                    <User className={`h-4.5 w-4.5 ${memberTheme.iconColor} group-hover:scale-110 transition-transform`} />
                  )}

                  {/* Ponto indicador de atividade em tempo real */}
                  {activeWorker && (
                    <>
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-ping" />
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                    </>
                  )}
                </button>

                {/* Nome do Usuário / Quadro e Status Ao Vivo */}
                <div className="min-w-0 flex flex-col justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBoardSelectorOpen((prev) => !prev);
                    }}
                    className="flex items-center gap-1.5 text-left group/name cursor-pointer"
                    title="Clique para alternar a visão do quadro"
                  >
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white group-hover/name:text-sky-300 transition-colors truncate leading-none">
                      {firstName}
                    </h3>
                    <ChevronDown className={`h-3.5 w-3.5 text-slate-400 group-hover/name:text-sky-300 transition-transform duration-200 ${isBoardSelectorOpen ? "rotate-180 text-sky-300" : ""}`} />
                  </button>

                  <div className="flex items-center gap-1.5 mt-1">
                    {activeWorker && activeDeal ? (
                      <div 
                        onClick={() => openDealHistory(activeDeal)}
                        className="inline-flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/50 px-2.5 py-0.5 rounded-full text-emerald-300 shadow-sm text-xs font-bold cursor-pointer hover:bg-emerald-900/80 transition-colors"
                        title="Clique para abrir detalhes da atividade em andamento"
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" />
                        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wider truncate max-w-[220px] sm:max-w-[340px] md:max-w-[460px]">
                          ATIVO EM:{" "}
                          <span className="text-white font-black">
                            {getCleanDealTitle(activeDeal.title)}
                          </span>
                        </span>
                        <span className="text-[10px] text-emerald-300 font-mono font-bold bg-emerald-900/60 px-1.5 py-0.5 rounded-md border border-emerald-500/30 shrink-0">
                          ({formatElapsedLive(activeWorker.startedAt, nowMs)})
                        </span>
                      </div>
                    ) : isAll ? (
                      <div className="inline-flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/60 px-2.5 py-0.5 rounded-full text-slate-400 text-xs font-bold font-mono">
                        <span className="h-2 w-2 rounded-full bg-sky-400 shrink-0" />
                        <span className="text-[10px] sm:text-[11px] uppercase tracking-wider">
                          {deals.filter((d) => d.stage !== "archived").length} ATIVIDADES ATIVAS
                        </span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 bg-slate-900/90 border border-slate-700/60 px-2.5 py-0.5 rounded-full text-slate-400 text-xs font-bold font-mono">
                        <span className="h-2 w-2 rounded-full bg-slate-500 shrink-0" />
                        <span className="text-[10px] sm:text-[11px] uppercase tracking-wider">
                          INATIVO NO MOMENTO
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dropdown Menu com visual Glassmorphism e Cores de Perfil */}
                {isBoardSelectorOpen && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-full left-3 mt-2 w-[350px] max-w-[90vw] rounded-2xl bg-slate-950/98 border border-white/15 backdrop-blur-2xl p-2 shadow-[0_15px_40px_rgba(0,0,0,0.85)] z-50 animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400 px-3 py-1.5 mb-1 border-b border-white/10 flex items-center justify-between">
                      <span>VISÃO DO QUADRO KANBAN</span>
                      <span className="text-[8px] text-muted-foreground">Clique para trocar</span>
                    </div>

                    <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar p-0.5">
                      {/* Opção 1: MEU QUADRO */}
                      {(() => {
                        const isMeUserActive = deals.some((d) => {
                          const worker = getDealActiveWorker(d);
                          return Boolean(worker && worker.userId === user?.id);
                        });

                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setInternalFilterUser("ME");
                              setIsBoardSelectorOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              isMe
                                ? `${myTheme.activeItem}`
                                : `text-slate-300 ${myTheme.hoverItem} hover:bg-white/5`
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <UserCheck className={`h-4 w-4 shrink-0 ${isMeUserActive ? "text-emerald-400" : "text-slate-400"}`} />
                              {isMeUserActive ? (
                                <span className="text-[8px] font-mono font-black px-1.5 py-0.2 rounded border uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.35)] shrink-0">
                                  ATIVO
                                </span>
                              ) : (
                                <span className="text-[8px] font-mono font-black px-1.5 py-0.2 rounded border uppercase tracking-wider bg-slate-800/80 text-slate-400 border-white/10 shrink-0">
                                  INATIVO
                                </span>
                              )}
                              <span className={`uppercase tracking-wide truncate ${isMeUserActive ? "font-black text-white" : "font-bold text-slate-400"}`}>
                                Meu Quadro
                              </span>
                              <span className={`text-[8px] font-mono font-black px-1.5 py-0.2 rounded border uppercase tracking-wider shrink-0 ${
                                isMeUserActive ? myTheme.badge : "bg-slate-800/60 text-slate-400 border-white/10"
                              }`}>
                                {myTheme.roleLabel}
                              </span>
                            </div>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-black/50 ${myTheme.text} border ${myTheme.border} shrink-0`}>
                              {deals.filter((d) => isDealUserMatching(d, user?.id) && d.stage !== "archived").length}
                            </span>
                          </button>
                        );
                      })()}

                      {/* Opção 2: QUADRO GERAL (TODOS) */}
                      <button
                        type="button"
                        onClick={() => {
                          setInternalFilterUser("ALL");
                          setIsBoardSelectorOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isAll
                            ? "bg-sky-500/25 text-sky-300 border border-sky-500/40 shadow-sm"
                            : "text-slate-300 hover:bg-sky-500/10 hover:text-sky-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Users className="h-4 w-4 shrink-0 text-sky-400" />
                          <span className="uppercase font-black tracking-wide truncate">Quadro Geral (Todos)</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-black/50 text-sky-400 border border-sky-500/30 shrink-0">
                          {deals.filter((d) => d.stage !== "archived").length}
                        </span>
                      </button>

                      {/* Divisor */}
                      <div className="h-px bg-white/10 my-1.5" />

                      <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500 px-3 py-0.5">
                        Quadro por Colaborador
                      </div>

                      {/* Lista de Membros da Equipe (Usuários ativos no topo) */}
                      {teamMembers
                        .filter((m) => m.id !== user?.id)
                        .sort((a, b) => {
                          const isAActive = deals.some((d) => {
                            const worker = getDealActiveWorker(d);
                            return Boolean(worker && worker.userId === a.id);
                          });
                          const isBActive = deals.some((d) => {
                            const worker = getDealActiveWorker(d);
                            return Boolean(worker && worker.userId === b.id);
                          });
                          if (isAActive && !isBActive) return -1;
                          if (!isAActive && isBActive) return 1;
                          const nameA = a.display_name || a.email || "";
                          const nameB = b.display_name || b.email || "";
                          return nameA.localeCompare(nameB);
                        })
                        .map((m) => {
                          const count = deals.filter((d) => isDealUserMatching(d, m.id) && d.stage !== "archived").length;
                          const isSelected = effectiveFilterUser === m.id;
                          const mFirstName = getFirstName(m.display_name || m.email || "Membro");
                          const mRole = (m.id === user?.id && isAdmin) ? "admin" : m.role;
                          const theme = getUserRoleTheme(mRole, m.email);

                          const isMemberActive = deals.some((d) => {
                            const worker = getDealActiveWorker(d);
                            return Boolean(worker && worker.userId === m.id);
                          });

                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setInternalFilterUser(m.id);
                                setIsBoardSelectorOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? `${theme.activeItem}`
                                  : `text-slate-300 ${theme.hoverItem} hover:bg-white/5`
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <User className={`h-3.5 w-3.5 shrink-0 ${isMemberActive ? "text-emerald-400" : "text-slate-400"}`} />
                                {isMemberActive ? (
                                  <span className="text-[8px] font-mono font-black px-1.5 py-0.2 rounded border uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.35)] shrink-0">
                                    ATIVO
                                  </span>
                                ) : (
                                  <span className="text-[8px] font-mono font-black px-1.5 py-0.2 rounded border uppercase tracking-wider bg-slate-800/80 text-slate-400 border-white/10 shrink-0">
                                    INATIVO
                                  </span>
                                )}
                                <span className={`uppercase truncate tracking-wide ${isMemberActive ? `font-black ${isSelected ? theme.text : "text-white"}` : "font-bold text-slate-400"}`}>
                                  {mFirstName}
                                </span>
                                <span className={`text-[8px] font-mono font-black px-1.5 py-0.2 rounded border uppercase tracking-wider shrink-0 ${
                                  isMemberActive ? theme.badge : "bg-slate-800/60 text-slate-400 border-white/10"
                                }`}>
                                  {theme.roleLabel}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-black/50 text-slate-300 shrink-0 border border-white/5">
                                {count}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Centro do Cabeçalho: Tag Centralizada de Isolamento de Etapa */}
        {isolatedStageId && (() => {
          const isLead = isolatedStageId === "lead";
          const isCompleted = isolatedStageId === "completed";
          const isLost = isolatedStageId === "lost";

          const tagTheme = isLead
            ? {
                btn: "bg-amber-950/85 hover:bg-rose-950/80 border border-amber-400/50 hover:border-rose-400/60 shadow-[0_0_20px_rgba(245,158,11,0.35)] hover:shadow-[0_0_20px_rgba(244,63,94,0.4)]",
                text: "text-amber-300 group-hover:text-rose-300",
              }
            : isCompleted
            ? {
                btn: "bg-emerald-950/85 hover:bg-rose-950/80 border border-emerald-400/50 hover:border-rose-400/60 shadow-[0_0_20px_rgba(52,211,153,0.35)] hover:shadow-[0_0_20px_rgba(244,63,94,0.4)]",
                text: "text-emerald-300 group-hover:text-rose-300",
              }
            : isLost
            ? {
                btn: "bg-rose-950/85 hover:bg-rose-950/90 border border-rose-400/50 hover:border-rose-400/60 shadow-[0_0_20px_rgba(244,63,94,0.35)] hover:shadow-[0_0_20px_rgba(244,63,94,0.4)]",
                text: "text-rose-300 group-hover:text-rose-200",
              }
            : {
                btn: "bg-sky-950/85 hover:bg-rose-950/80 border border-sky-400/50 hover:border-rose-400/60 shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:shadow-[0_0_20px_rgba(244,63,94,0.4)]",
                text: "text-sky-300 group-hover:text-rose-300",
              };

          return (
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-30 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsolatedStageId(null);
                }}
                className={`group inline-flex items-center justify-center px-4 py-1.5 rounded-xl ${tagTheme.btn} backdrop-blur-xl transition-all duration-200 cursor-pointer animate-in fade-in select-none max-w-[38vw]`}
                title="Clique para fechar e voltar às colunas completas"
              >
                <span className={`text-xs sm:text-sm font-black uppercase tracking-wider ${tagTheme.text} leading-none transition-colors group-hover:hidden truncate`}>
                  {STAGES.find((s) => s.id === isolatedStageId)?.title || "ATIVIDADE"}
                </span>
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-rose-300 leading-none transition-colors hidden group-hover:inline">
                  FECHAR
                </span>
              </button>
            </div>
          );
        })()}

        {/* Lado Direito: Calendário de Prazos, Caixa de Entrada de Menções (@usuario), ADM e Sair */}
        <div className="flex items-center gap-2 sm:gap-2.5 justify-end shrink-0">
          {/* Botão de Calendário de Prazos no Cabeçalho */}
          <button
            type="button"
            onClick={() => {
              setCalendarUserFilter(role === "admin" ? "ALL" : (user?.id || "ALL"));
              setIsCalendarModalOpen(true);
            }}
            className="btn-ghost-neon h-9 px-3 rounded-xl flex items-center justify-center gap-1.5 text-sky-400 hover:text-white border border-sky-500/30 hover:border-sky-400/60 bg-sky-500/10 shadow-sm transition-all hover:scale-105 cursor-pointer text-xs font-black uppercase tracking-wider"
            title={role === "admin" ? "Calendário de Prazos (Geral de Todos os Responsáveis)" : "Meu Calendário de Prazos"}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Prazos</span>
            <span className="px-1.5 py-0.2 rounded-md bg-sky-500/20 text-sky-300 font-mono text-[10px] font-bold border border-sky-400/40">
              {role === "admin"
                ? deals.filter((d) => Boolean(d.expected_close_date) && d.stage !== "archived" && d.stage !== "won" && d.stage !== "completed" && d.stage !== "lost" && !isDealPendingAuthorAcceptance(d)).length
                : deals.filter((d) => d.assigned_user_id === user?.id && Boolean(d.expected_close_date) && d.stage !== "archived" && d.stage !== "won" && d.stage !== "completed" && d.stage !== "lost" && !isDealPendingAuthorAcceptance(d)).length
              }
            </span>
          </button>

          {/* Botão Caixa de Entrada Unificada (Inbox: Notificações + Menções) */}
          <button
            type="button"
            onClick={() => setIsMentionsInboxOpen(true)}
            className="btn-ghost-neon h-9 px-3 rounded-xl flex items-center justify-center gap-1.5 text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400/60 bg-cyan-500/10 shadow-sm transition-all hover:scale-105 cursor-pointer text-xs font-black uppercase tracking-wider"
            title="Abrir Inbox (Notificações e Menções)"
          >
            <Inbox className="h-3.5 w-3.5 text-cyan-400" />
            <span>INBOX</span>

            {/* Badge de Pendências Não Lidas no Inbox */}
            {totalInboxUnreadCount > 0 && (
              <span
                className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white font-mono font-black text-[10px] shadow-[0_0_10px_rgba(244,63,94,0.9)] animate-pulse shrink-0 ml-0.5 leading-none select-none"
                title={`Você possui ${totalInboxUnreadCount} ${
                  totalInboxUnreadCount === 1 ? "pendência no Inbox" : "pendências no Inbox"
                }`}
              >
                {totalInboxUnreadCount}
              </span>
            )}
          </button>

          {/* ADM e Sair */}
          <div className="flex items-center gap-2">
            {role === "admin" && (
              <Link
                to="/admin"
                search={{ from: "crm" }}
                className="btn-ghost-neon h-9 rounded-xl px-3 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-cyan-300 hover:text-white border border-cyan-500/30 hover:border-cyan-400/60 bg-cyan-500/10 shadow-sm transition-all hover:scale-105 cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <span>ADM</span>
              </Link>
            )}

            <button
              type="button"
              onClick={handleExit}
              className="btn-ghost-neon h-9 rounded-xl px-3 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-rose-400 hover:text-rose-300 border border-rose-500/30 hover:border-rose-400/60 bg-rose-500/10 shadow-sm transition-all hover:scale-105 cursor-pointer"
              title={role === "admin" ? "Voltar ao Seletor de Módulos" : "Sair do Sistema"}
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </button>
          </div>
        </div>
        </header>

      {/* Quadro de Tarefas / Atividades Kanban com Estilo Futurista Glass e Rolagem Própria por Coluna */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden pt-0">
        {/* Exibição das Colunas (Modo Normal: 5 Colunas de Etapas | Modo Isolado: Colunas Kanban por Usuário Responsável) */}
        {(() => {
          // Helper para buscar tarefas vinculadas a uma atividade primária
          const getSubtasksForDeal = (parentDeal: Deal, pool: Deal[]) => {
            const parentReq = getDealReqNumber(parentDeal, deals);
            return pool.filter((other) => {
              if (other.id === parentDeal.id) return false;
              const pInfo = getParentDealInfo(other);
              if (!pInfo) return false;
              return (
                pInfo.id === parentDeal.id ||
                (pInfo.reqNumber && pInfo.reqNumber === parentReq) ||
                (pInfo.deal && pInfo.deal.id === parentDeal.id)
              );
            });
          };

          // Helper para verificar se um deal é subtarefa cujo pai está presente no pool
          const isSubtaskWithParentInPool = (deal: Deal, pool: Deal[]) => {
            const pInfo = getParentDealInfo(deal);
            if (!pInfo) return false;
            return pool.some((other) => {
              if (other.id === deal.id) return false;
              const otherReq = getDealReqNumber(other, deals);
              return (
                (pInfo.id && other.id === pInfo.id) ||
                (pInfo.reqNumber && otherReq === pInfo.reqNumber)
              );
            });
          };

          // Helper unificado para renderizar cards de atividade em qualquer modo
          const renderDealCard = (
            deal: Deal,
            stageId: string,
            isCompactView: boolean = false,
            isSubtaskCard: boolean = false,
            cardIndex: number = 0
          ) => {
            const pInfo = getParentDealInfo(deal);
            const isSubtask = isSubtaskCard || Boolean(pInfo);
            const linkedSubtasks = !isSubtask ? getSubtasksForDeal(deal, deals) : [];
            const isExpanded = Boolean(expandedSubtaskDealIds[deal.id]);

            const reqNumber = getDealReqNumber(deal, deals);
            const canModifyDeal = role === "admin" || deal.assigned_user_id === user?.id;

            const isPendingAcceptance = isDealPendingAuthorAcceptance(deal);
            const hasDeadline = !isPendingAcceptance && Boolean(deal.expected_close_date);
            const internalStyle = getInternalDeadlineStyle(deal.expected_close_date);
            const aging = getDealAgingStyle(deal.latest_update_at || deal.created_at);

            const cardBgClass = isPendingAcceptance
              ? "!bg-black !bg-none border-2 !border-zinc-700 shadow-[0_0_15px_rgba(0,0,0,0.9)] text-white"
              : aging.cardClass;

            const isBeingDragged = draggingDealId === deal.id;

            const cardCustomer = getDealCustomer(deal);
            const cardCustomerName =
              cardCustomer?.company_name ||
              cardCustomer?.name ||
              (deal.customer_name && deal.customer_name !== "Uso Interno / Empresa"
                ? deal.customer_name
                : null);

            // Remove prefixos repetitivos para manter o card limpo e direto
            const cleanTitle = getCleanDealTitle(deal.title);

            const cardElement = (
              <div
                key={deal.id}
                draggable={canModifyDeal}
                onDragStart={(e) => {
                  if (!canModifyDeal) {
                    e.preventDefault();
                    return;
                  }
                  isDraggingRef.current = true;
                  setDraggingDealId(deal.id);
                  draggingDealIdRef.current = deal.id;
                  setDragOverTargetDealId(null);
                  e.dataTransfer.setData("text/plain", deal.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDraggingDealId(null);
                  draggingDealIdRef.current = null;
                  setDragOverTargetDealId(null);
                  setDragOverStageId(null);
                  setTimeout(() => {
                    isDraggingRef.current = false;
                  }, 100);
                }}
                onDragOver={(e) => {
                  if (!draggingDealIdRef.current && !draggingDealId) return;
                  const draggedId = draggingDealIdRef.current || draggingDealId;
                  if (draggedId && draggedId !== deal.id) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";

                    const rect = e.currentTarget.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    const pos = e.clientY < midY ? "before" : "after";

                    if (dragOverTargetDealId !== deal.id) {
                      setDragOverTargetDealId(deal.id);
                    }

                    // Se a tarefa arrastada pertence ao mesmo estágio, atualiza ordenação em tempo real (arraste contínuo fluido)
                    const draggedDeal = deals.find((d) => d.id === draggedId);
                    if (draggedDeal && draggedDeal.stage === stageId) {
                      // Usuário comum só pode reordenar se AMBAS as tarefas forem dele
                      if (!isAdmin) {
                        if (draggedDeal.assigned_user_id !== user?.id || deal.assigned_user_id !== user?.id) {
                          return;
                        }
                      }

                      handleReorderDealWithinStage(
                        stageId as Deal["stage"],
                        draggedId,
                        deal.id,
                        pos,
                        false
                      );
                    }
                  }
                }}
                onDragLeave={(e) => {
                  if (
                    dragOverTargetDealId === deal.id &&
                    !e.currentTarget.contains(e.relatedTarget as Node)
                  ) {
                    setDragOverTargetDealId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const sourceDealId =
                    e.dataTransfer.getData("text/plain") ||
                    draggingDealIdRef.current ||
                    draggingDealId;
                  setDragOverTargetDealId(null);
                  setDragOverStageId(null);

                  if (sourceDealId && sourceDealId !== deal.id) {
                    const sourceDeal = deals.find((d) => d.id === sourceDealId);
                    if (!sourceDeal) return;

                    if (role !== "admin" && sourceDeal.assigned_user_id !== user?.id) {
                      return toast.error("Você só pode alterar as atividades sob sua responsabilidade.");
                    }

                    if (sourceDeal.stage !== stageId) {
                      handleMoveStage(sourceDeal, stageId as Deal["stage"]);
                    }
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDraggingRef.current) return;
                  openDealHistory(deal);
                }}
                className={`group crm-card w-full relative rounded-xl border px-3 py-2.5 transition-all duration-200 ease-out flex flex-col justify-between h-[88px] min-h-[88px] max-h-[88px] overflow-hidden select-none ${
                  isBeingDragged
                    ? "border-2 border-dashed border-sky-400/50 bg-sky-500/10 shadow-[inset_0_0_20px_rgba(56,189,248,0.15)] flex items-center justify-center"
                    : canModifyDeal
                    ? `cursor-grab active:cursor-grabbing hover:shadow-lg shadow-sm ${cardBgClass}`
                    : `cursor-pointer hover:shadow-lg shadow-sm ${cardBgClass}`
                }`}
              >
                {isBeingDragged ? (
                  <div className="w-full h-full flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150 select-none">
                    <span className="font-mono text-xs font-black uppercase tracking-[0.2em] text-sky-300 drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]">
                      PRIORIDADE {cardIndex + 1}
                    </span>
                  </div>
                ) : (
                  <>
                {/* STATUS OFICIAL EM TEMPO REAL: PULSO TRABALHANDO/VENCIDA */}
                {(() => {
                  const activeWorker = getDealActiveWorker(deal);
                  const isExpiredTask = !isPendingAcceptance && internalStyle.isExpired && deal.stage !== "completed" && deal.stage !== "won" && deal.stage !== "lost" && deal.stage !== "archived";
                  
                  if (!activeWorker && !isExpiredTask) return null;

                  // Se está em andamento -> Modo exclusivo "working" (NUNCA mostra "VENCIDA")
                  // Se está vencida e não está em andamento -> Modo exclusivo "expired" (NUNCA mostra "TRABALHANDO")
                  const mode: "working" | "expired" = activeWorker ? "working" : "expired";

                  // Ciclo A (inProgressAlternation === true) -> pulsa apenas os cards em ANDAMENTO ("TRABALHANDO")
                  // Ciclo B (inProgressAlternation === false) -> pulsa apenas os cards VENCIDOS ("VENCIDA")
                  const isVisible = mode === "working" ? inProgressAlternation : !inProgressAlternation;
                  const isWorking = mode === "working";

                  return (
                    <div
                      className={`absolute inset-0 rounded-xl bg-slate-950/60 backdrop-blur-[2px] p-3 flex flex-col items-center justify-center text-center z-20 pointer-events-none transition-all duration-[1500ms] ease-in-out group-hover:opacity-0 ${
                        isVisible ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
                      }`}
                    >
                      {/* Linha 1: TRABALHANDO (azul/ciano) ou VENCIDA (vermelho vivo) */}
                      <span
                        className={`font-mono text-xs sm:text-[13px] font-black uppercase tracking-[0.25em] ${
                          isWorking
                            ? "text-sky-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.7)]"
                            : "text-red-400 drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                        }`}
                      >
                        {isWorking ? "TRABALHANDO" : "VENCIDA"}
                      </span>

                      {/* Divisor com intensidade aumentada e brilho neon */}
                      <div
                        className={`w-24 sm:w-28 h-[2px] rounded-full bg-gradient-to-r from-transparent ${
                          isWorking
                            ? "via-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.9)]"
                            : "via-red-400 shadow-[0_0_10px_rgba(239,68,68,0.9)]"
                        } to-transparent my-1.5`}
                      />

                      {/* Linha 2: Nome do Responsável em destaque (apenas primeiro nome) */}
                      <span className="font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] truncate max-w-[210px]">
                        {getFirstName(activeWorker?.userName || deal.assigned_user_name || "RESPONSÁVEL")}
                      </span>
                    </div>
                  );
                })()}

                {/* OVERLAY DE ATUALIZAÇÃO NO HOVER: DESATIVADO DURANTE ARRASTE/MOVIMENTAÇÃO */}
                {!isBeingDragged && !draggingDealId && (
                  <div className="crm-hover-update-overlay absolute inset-0 rounded-xl bg-slate-950/95 backdrop-blur-md px-3 py-2 flex flex-col justify-between text-left opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-30 overflow-hidden shadow-xl">
                    {(() => {
                      const fallbackAuthor = deal.latest_update_author || deal.creator_name || deal.assigned_user_name || "Usuário";
                      const hoverData = getCleanHoverNote(deal.notes, fallbackAuthor);

                      const agingLabel =
                        aging.days === 0
                          ? "atualizado hoje"
                          : aging.days === 1
                          ? "1 dia sem atualização"
                          : aging.days > 15
                          ? "+15 dias sem atualização"
                          : `${aging.days} dias sem atualização`;

                        return (
                          <>
                            <div className="crm-hover-scroll-container flex-1 min-h-[48px] max-h-[48px] w-full select-none">
                              <div
                                ref={(el) => {
                                  if (el && el.parentElement) {
                                    const parentH = el.parentElement.clientHeight;
                                    const scrollH = el.scrollHeight;
                                    if (scrollH > parentH + 2) {
                                      const diffPx = scrollH - parentH;
                                      el.style.setProperty("--scroll-diff", `-${diffPx}px`);
                                      // Velocidade bem lenta: 8 segundos base + proporcional à quantidade de texto
                                      const durationSec = Math.max(6, (diffPx / 10) + 4);
                                      el.style.setProperty("--scroll-duration", `${durationSec}s`);
                                      el.classList.add("should-scroll");
                                    } else {
                                      el.classList.remove("should-scroll");
                                    }
                                  }
                                }}
                                className="crm-hover-scroll-content text-[11px] font-medium text-slate-100 leading-snug whitespace-pre-wrap"
                              >
                                <strong className="text-sky-300 font-bold">[{hoverData.author}]: </strong>
                                {hoverData.text}
                              </div>
                            </div>
                            <div className="w-full pt-1 mt-auto border-t border-white/10 flex items-center justify-end shrink-0">
                              <span className={`text-[9px] font-mono font-black uppercase tracking-wider ${aging.accentText} flex items-center gap-1.5`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${aging.dotColor} shadow-[0_0_6px_currentColor]`} />
                                {agingLabel}
                              </span>
                            </div>
                          </>
                        );
                    })()}
                  </div>
                )}

                {/* 1. PRIMEIRA LINHA: CLIENTE - TÍTULO DA ATIVIDADE NA MESMA COR */}
                <div className="w-full min-w-0 h-[18px] flex items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {isSubtask && (
                      <span className="font-mono text-[8px] font-black px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-400/40 uppercase shrink-0">
                        VINCULADA
                      </span>
                    )}
                    <h3
                      className={`font-black uppercase tracking-wider truncate leading-none flex-1 ${
                        isSubtask ? "text-sky-300" : "text-sky-400"
                      }`}
                      title={cardCustomerName ? `${cardCustomerName.trim().toUpperCase()} - ${cleanTitle}` : cleanTitle}
                    >
                      {cardCustomerName && cardCustomerName.trim() !== "" ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (cardCustomer) {
                                setSelectedCustomerForDetails(cardCustomer);
                              } else {
                                toast.info(`Cliente: ${cardCustomerName}`);
                              }
                            }}
                            className="hover:underline cursor-pointer hover:text-sky-200 transition-colors"
                            title="Clique para ver a ficha do cliente"
                          >
                            {cardCustomerName.trim().toUpperCase()}
                          </button>
                          <span className="opacity-70 mx-1.5">-</span>
                          <span>{cleanTitle}</span>
                        </>
                      ) : (
                        <span>{cleanTitle}</span>
                      )}
                    </h3>
                  </div>
                </div>

                {/* 2. SEGUNDA LINHA: NÚMERO DE REGISTRO (ALINHADO À ESQUERDA) + ALERTA DE TAREFAS VINCULADAS (CENTRALIZADO) + RESPONSÁVEL */}
                <div className="w-full relative flex items-center justify-between h-[22px] min-h-[22px] max-h-[22px] gap-1.5">
                  {/* Esquerda: Registro alinhado com o texto superior */}
                  <div className="flex items-center shrink-0">
                    <span
                      title={`Registro: ${reqNumber}`}
                      className="font-mono text-[10px] font-black px-2 py-0.5 rounded-md bg-black/50 text-sky-300 border border-sky-400/40 tracking-wider shadow-inner flex items-center justify-center h-[20px]"
                    >
                      {reqNumber}
                    </span>
                  </div>

                  {/* Centro: Badge de Atividades Vinculadas */}
                  <div className="flex-1 flex items-center justify-center min-w-0 px-1">
                    {!isSubtask && linkedSubtasks.length > 0 && (
                      <div
                        title={`Esta atividade possui ${linkedSubtasks.length} ${
                          linkedSubtasks.length === 1 ? "atividade vinculada" : "atividades vinculadas"
                        }`}
                        className="font-mono text-[9px] font-black px-1.5 py-0.5 rounded-md bg-sky-950/90 text-sky-300 border border-sky-500/50 flex items-center justify-center shrink-0 h-[20px] shadow-sm select-none"
                      >
                        <span>{linkedSubtasks.length} {linkedSubtasks.length === 1 ? "VINCULADA" : "VINCULADAS"}</span>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const unseenCount = getUnseenRepliesCount(deal);
                    const hasUnseen = unseenCount > 0;
                    
                    return (
                      <button
                        type="button"
                        onClick={(e) => handleToggleUserFilter(deal.assigned_user_id, e)}
                        className={`group/userbtn shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/50 border transition-all cursor-pointer shadow-sm h-[20px] flex items-center gap-1 max-w-[155px] ml-auto ${
                          hasUnseen
                            ? "animate-pulse border-red-500/60 bg-red-500/10 text-red-300 hover:text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                            : internalFilterUser === deal.assigned_user_id
                            ? "text-rose-300 border-rose-400/50 hover:bg-rose-500/25 hover:shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                            : "text-white hover:text-emerald-300 border-white/15 hover:border-emerald-400/50 hover:bg-emerald-500/20 hover:shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                        }`}
                        title={
                          hasUnseen
                            ? `Você possui ${unseenCount} ${unseenCount === 1 ? "resposta não lida" : "respostas não lidas"} nesta atividade!`
                            : internalFilterUser === deal.assigned_user_id
                            ? "Contrair Responsável"
                            : "Expandir Responsável"
                        }
                      >
                        {hasUnseen ? (
                          <span className="inline-flex items-center justify-center text-center bg-red-500 text-white font-mono font-black text-[9px] w-3.5 h-3.5 min-w-[14px] min-h-[14px] rounded-full border border-slate-950 -ml-0.5 shrink-0 leading-none select-none">
                            {unseenCount}
                          </span>
                        ) : (
                          <UserCheck
                            className={`h-3 w-3 shrink-0 transition-colors ${
                              internalFilterUser === deal.assigned_user_id
                                ? "text-rose-400"
                                : "text-sky-400 group-hover/userbtn:text-emerald-400"
                            }`}
                          />
                        )}
                        <span className="truncate group-hover/userbtn:hidden">{deal.assigned_user_name}</span>
                        <span
                          className={`hidden group-hover/userbtn:inline-flex items-center gap-1 truncate animate-in fade-in duration-150 ${
                            hasUnseen
                              ? "text-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                              : internalFilterUser === deal.assigned_user_id
                              ? "text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.7)]"
                              : "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                          }`}
                        >
                          <span className="truncate">{deal.assigned_user_name}</span>
                          <span className="opacity-60">-</span>
                          <span>{internalFilterUser === deal.assigned_user_id ? "CONTRAIR" : "EXPANDIR"}</span>
                        </span>
                      </button>
                    );
                  })()}
                </div>

                {/* 3. RODAPÉ DO CARD: PRAZO SE HOUVER (INTERNAS OU EXTERNAS COM PRAZO) / AGUARDANDO ACEITE / DIAS EM ABERTO */}
                <div className={`flex items-center justify-between gap-2 text-[10px] min-w-0 ${isPendingAcceptance ? "pt-1 mt-0.5 border-t border-white/10" : "h-[20px] min-h-[20px] max-h-[20px]"}`}>
                  {hasDeadline ? (
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      {internalStyle.isExpired ? (
                        <span
                          title={`Prazo original: ${formatDeadlineWithWeekday(deal.expected_close_date) || ""}`}
                          className={`font-mono text-[9px] font-black flex items-center justify-center shadow-sm tracking-tight shrink-0 ${internalStyle.indicatorBadgeClass}`}
                        >
                          {internalStyle.indicatorBadge}
                        </span>
                      ) : (
                        <>
                          {internalStyle.indicatorBadge && (
                            <span
                              title={internalStyle.hoverText}
                              className={`font-mono text-[9px] font-black flex items-center justify-center shadow-sm tracking-tight shrink-0 ${internalStyle.indicatorBadgeClass}`}
                            >
                              {internalStyle.indicatorBadge}
                            </span>
                          )}
                          <span
                            className={`font-mono truncate ${internalStyle.colorClass}`}
                            title={formatDeadlineWithWeekday(deal.expected_close_date) || ""}
                          >
                            {formatDeadlineWithWeekday(deal.expected_close_date)}
                          </span>
                        </>
                      )}
                    </div>
                  ) : isPendingAcceptance ? (
                    <div className="flex items-center justify-start w-full min-w-0 pl-0.5">
                      {(() => {
                        const authorRawName = deal.creator_name || teamMembers.find((m) => m.id === deal.user_id)?.display_name || "AUTOR";
                        const authorFirstName = getFirstName(authorRawName).toUpperCase();
                        return (
                          <span
                            title={`Atividade finalizada pelo responsável. Aguardando aceite de conclusão por ${authorRawName}.`}
                            className="text-[9px] font-mono font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 truncate"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)] shrink-0" />
                            AGUARDANDO ACEITE DE {authorFirstName}
                          </span>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      {(() => {
                        const days = getEffectiveCalendarDays(deal.created_at);
                        
                        if (days === 0) {
                          return (
                            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 truncate">
                              aberta hoje
                            </span>
                          );
                        }

                        return (
                          <span
                            title={`Atividade aberta há ${days} ${days === 1 ? "dia" : "dias"}`}
                            className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/80 truncate"
                          >
                            {`aberta há ${days} ${days === 1 ? "dia" : "dias"}`}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
                </>
                )}
              </div>
            );

            // Se for card de subtarefa renderizado dentro do container aninhado, retorna diretamente o elemento do card
            if (isSubtask) {
              return cardElement;
            }

            // Se for atividade primária (com ou sem tarefas vinculadas), retorna o card e a lista recolhida/expandida no hover ou clique
            const isHoveredOrExpanded = isExpanded || hoveredSubtasksDealId === deal.id;

            return (
              <div
                key={deal.id}
                onMouseEnter={() => {
                  if (linkedSubtasks.length > 0) {
                    setHoveredSubtasksDealId(deal.id);
                  }
                }}
                onMouseLeave={() => {
                  if (hoveredSubtasksDealId === deal.id) {
                    setHoveredSubtasksDealId(null);
                  }
                }}
                className="w-full flex flex-col space-y-1.5 transition-all duration-200"
              >
                {cardElement}

                {/* Lista de Tarefas Vinculadas em Árvore (Linha tracejada conecta no meio de cada card) */}
                {isHoveredOrExpanded && linkedSubtasks.length > 0 && (
                  <div className="w-full flex flex-col space-y-2 pt-1 pb-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    {linkedSubtasks.map((subtask, idx) => {
                      const isLast = idx === linkedSubtasks.length - 1;
                      return (
                        <div key={subtask.id} className="relative flex items-center pl-5">
                          {/* Linha vertical principal: vai de cima a baixo ou para no meio se for a última */}
                          <div
                            className={`absolute left-2.5 top-0 border-l-2 border-dashed border-sky-400/50 ${
                              isLast ? "h-1/2" : "h-full"
                            }`}
                          />
                          {/* Conector horizontal que vai até o card vinculado na metade da sua altura */}
                          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 border-b-2 border-dashed border-sky-400/50" />

                          {/* Card da tarefa vinculada */}
                          <div className="w-full min-w-0">
                            {renderDealCard(subtask, stageId, isCompactView, true, idx)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          };

          // CASO 1: MODO ISOLADO / EXPANDIDO (Colunas Kanban por Usuário Responsável)
          if (isolatedStageId) {
            const currentStage = STAGES.find((s) => s.id === isolatedStageId) || STAGES[0];
            let stageDeals = visibleDeals.filter((d) => d.stage === currentStage.id);

            if (effectiveFilterUser !== "ALL") {
              stageDeals = stageDeals.filter((d) => isDealUserMatching(d, effectiveFilterUser));
            }

            const currentStageTerm = (stageSearchTerms[currentStage.id] || "").trim().toLowerCase();
            if (currentStageTerm) {
              stageDeals = stageDeals.filter(
                (d) =>
                  d.title?.toLowerCase().includes(currentStageTerm) ||
                  d.req_number?.toLowerCase().includes(currentStageTerm) ||
                  getDealReqNumber(d, deals).toLowerCase().includes(currentStageTerm) ||
                  d.notes?.toLowerCase().includes(currentStageTerm) ||
                  d.assigned_user_name?.toLowerCase().includes(currentStageTerm) ||
                  d.creator_name?.toLowerCase().includes(currentStageTerm) ||
                  (d.customer_name && d.customer_name.toLowerCase().includes(currentStageTerm))
              );
            }

            // Agrupamento por Usuário (se estiver aguardando aceite, inclui para o Autor e para o Responsável)
            const userGroupsMap = new Map<string, { id: string; name: string; deals: Deal[] }>();
            stageDeals.forEach((deal) => {
              const isPending = isDealPendingAuthorAcceptance(deal);
              if (isPending && deal.user_id && deal.assigned_user_id && deal.user_id !== deal.assigned_user_id) {
                // Adiciona para o Autor
                const authorId = deal.user_id;
                const authorName = deal.creator_name || teamMembers.find((m) => m.id === authorId)?.display_name || "Autor";
                if (!userGroupsMap.has(authorId)) {
                  userGroupsMap.set(authorId, { id: authorId, name: authorName, deals: [] });
                }
                userGroupsMap.get(authorId)!.deals.push(deal);

                // Adiciona para o Responsável
                const respId = deal.assigned_user_id;
                const respName = deal.assigned_user_name || "Sem Responsável";
                if (!userGroupsMap.has(respId)) {
                  userGroupsMap.set(respId, { id: respId, name: respName, deals: [] });
                }
                userGroupsMap.get(respId)!.deals.push(deal);
              } else {
                const uId = deal.assigned_user_id || "unassigned";
                const uName = deal.assigned_user_name || "Sem Responsável";
                if (!userGroupsMap.has(uId)) {
                  userGroupsMap.set(uId, { id: uId, name: uName, deals: [] });
                }
                userGroupsMap.get(uId)!.deals.push(deal);
              }
            });

            const userGroups = Array.from(userGroupsMap.values()).sort((a, b) => {
              if (a.id === "unassigned") return 1;
              if (b.id === "unassigned") return -1;
              return a.name.localeCompare(b.name);
            });

            const isManyUsers = userGroups.length > 4;

            return (
              <div className="flex-1 min-h-0 flex gap-3.5 h-full overflow-x-auto overflow-y-hidden pt-1 pb-1 px-0.5">
                {userGroups.length === 0 ? (
                  <div className="w-full flex items-center justify-center p-12 text-muted-foreground uppercase tracking-widest text-xs border border-dashed border-white/10 rounded-2xl">
                    Nenhuma atividade encontrada nesta etapa.
                  </div>
                ) : (
                  userGroups.map((group) => {
                    const uTerm = (userSearchTerms[group.id] || "").trim().toLowerCase();
                    let displayedUserDeals = group.deals;
                    if (uTerm) {
                      displayedUserDeals = displayedUserDeals.filter(
                        (d) =>
                          d.title?.toLowerCase().includes(uTerm) ||
                          d.req_number?.toLowerCase().includes(uTerm) ||
                          getDealReqNumber(d, deals).toLowerCase().includes(uTerm) ||
                          d.notes?.toLowerCase().includes(uTerm) ||
                          (d.customer_name && d.customer_name.toLowerCase().includes(uTerm))
                      );
                    }

                    // Prioridade máxima para atividades ativas (trabalhando no momento) e envio de atividades aguardando aceite para o final
                    displayedUserDeals = [...displayedUserDeals].sort((a, b) => {
                      const isDealOrSubActive = (deal: Deal) => {
                        if (getDealActiveWorker(deal)) return true;
                        const subtasks = getSubtasksForDeal(deal, deals);
                        return subtasks.some((s) => Boolean(getDealActiveWorker(s)));
                      };
                      const activeA = isDealOrSubActive(a);
                      const activeB = isDealOrSubActive(b);
                      if (activeA && !activeB) return -1;
                      if (!activeA && activeB) return 1;

                      // Atividades aguardando aceite vão para o final da coluna
                      const isPendingA = isDealPendingAuthorAcceptance(a);
                      const isPendingB = isDealPendingAuthorAcceptance(b);
                      if (!isPendingA && isPendingB) return -1;
                      if (isPendingA && !isPendingB) return 1;

                      const timeA = new Date(a.created_at || a.updated_at || 0).getTime();
                      const timeB = new Date(b.created_at || b.updated_at || 0).getTime();
                      return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
                    });

                    const isUserSearchOpen = openSearchUserId === group.id;
                    const topLevelUserDeals = displayedUserDeals.filter(
                      (deal) => !isSubtaskWithParentInPool(deal, displayedUserDeals)
                    );

                    const avgUserDaysFormatted = (() => {
                      if (!displayedUserDeals || displayedUserDeals.length === 0) return "0,0";
                      const totalDays = displayedUserDeals.reduce((sum, d) => {
                        return sum + getEffectiveCalendarDays(d.created_at);
                      }, 0);
                      return (totalDays / displayedUserDeals.length).toFixed(1).replace(".", ",");
                    })();

                    return (
                      <div
                        key={group.id}
                        onClick={(e) => e.stopPropagation()}
                        className={`glass flex flex-col rounded-2xl border ${currentStage.border} ${currentStage.bg || ""} overflow-hidden shadow-xl transition-all h-full max-h-full ${
                          isManyUsers ? "min-w-[280px] max-w-[280px]" : "flex-1 min-w-[280px]"
                        }`}
                      >
                        {/* Header da Coluna do Usuário com Hover Interno e Ações de Expandir */}
                        <div
                          onMouseEnter={() => setHoveredUserSubcolId(group.id)}
                          onMouseLeave={() => setHoveredUserSubcolId(null)}
                          onClick={() => {
                            if (group.id !== "unassigned") {
                              setInternalFilterUser((prev) => (prev === group.id ? "ALL" : group.id));
                            }
                          }}
                          className={`group/subcol shrink-0 flex items-center justify-between p-3 border-b select-none cursor-pointer transition-all duration-200 relative overflow-hidden ${
                            internalFilterUser === group.id
                              ? "border-white/10 bg-gradient-to-b from-rose-500/20 via-rose-950/40 to-transparent hover:bg-rose-500/25 hover:border-rose-400/50 shadow-[inset_0_1px_15px_rgba(244,63,94,0.15)] hover:shadow-[inset_0_1px_20px_rgba(244,63,94,0.3)]"
                              : `border-white/10 bg-gradient-to-b ${currentStage.glow} to-transparent hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:shadow-[inset_0_1px_20px_rgba(52,211,153,0.25)]`
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`p-1.5 rounded-xl border shrink-0 pointer-events-none transition-colors ${
                                internalFilterUser === group.id
                                  ? "bg-rose-500/20 text-rose-300 border-rose-400/30"
                                  : "bg-sky-500/20 text-sky-300 border-sky-400/30 group-hover/subcol:bg-emerald-500/20 group-hover/subcol:text-emerald-300 group-hover/subcol:border-emerald-400/30"
                              }`}
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex flex-col justify-center">
                              {/* Nome do Responsável */}
                              <button
                                type="button"
                                onMouseEnter={() => setHoveredSubcolUser(group.id)}
                                onMouseLeave={() => setHoveredSubcolUser(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (group.id !== "unassigned") {
                                    setIsolatedStageId(null);
                                    setInternalFilterUser(group.id);
                                  }
                                }}
                                className="text-xs font-black uppercase tracking-wider text-white hover:text-indigo-300 transition-colors text-left truncate block max-w-[170px] cursor-pointer leading-tight hover:underline"
                                title="Expandir todas as atividades deste responsável"
                              >
                                {group.name}
                              </button>

                              {/* Surge abaixo do nome: 'Expandir Responsável' se o mouse estiver sobre o nome, ou 'Expandir Atividade' se estiver na área do topo */}
                              {hoveredSubcolUser === group.id ? (
                                <span className="text-[9px] uppercase font-bold tracking-wider text-indigo-300 drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] truncate pointer-events-none animate-in fade-in duration-150 leading-none mt-1">
                                  Expandir Responsável
                                </span>
                              ) : (
                                <span
                                  className={`text-[9px] uppercase font-bold tracking-wider hidden group-hover/subcol:block truncate pointer-events-none animate-in fade-in duration-150 leading-none mt-1 ${
                                    internalFilterUser === group.id
                                      ? "text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.7)]"
                                      : "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]"
                                  }`}
                                >
                                  {internalFilterUser === group.id ? "Contrair Atividade" : "Expandir Atividade"}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <div className="relative flex items-center crm-search-box">
                              {isUserSearchOpen ? (
                                <div className="flex items-center gap-1 bg-black/80 border border-sky-400/50 rounded-lg px-2 py-0.5 animate-in fade-in max-w-[120px] shadow-sm">
                                  <Search className="h-3 w-3 text-sky-400 shrink-0" />
                                  <input
                                    type="text"
                                    placeholder="Pesquisar..."
                                    value={userSearchTerms[group.id] || ""}
                                    onChange={(e) =>
                                      setUserSearchTerms((prev) => ({ ...prev, [group.id]: e.target.value }))
                                    }
                                    className="bg-transparent text-[10px] text-white outline-none w-full placeholder:text-white/40 font-medium"
                                    autoFocus
                                  />
                                  {userSearchTerms[group.id] ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setUserSearchTerms((prev) => ({ ...prev, [group.id]: "" }))
                                      }
                                      className="text-[10px] text-muted-foreground hover:text-white px-0.5"
                                      title="Limpar busca"
                                    >
                                      ✕
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setOpenSearchUserId(null)}
                                      className="text-[10px] text-muted-foreground hover:text-white px-0.5"
                                      title="Fechar busca"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setOpenSearchUserId(group.id)}
                                  className={`p-1.5 rounded-lg text-xs transition-all flex items-center gap-1 cursor-pointer ${
                                    userSearchTerms[group.id]
                                      ? "bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-sm"
                                      : "bg-white/5 text-muted-foreground hover:text-white border border-white/10 hover:border-white/20"
                                  }`}
                                  title={`Pesquisar atividades de ${group.name}`}
                                >
                                  <Search className="h-3.5 w-3.5" />
                                  {userSearchTerms[group.id] && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                                  )}
                                </button>
                              )}
                            </div>

                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white font-mono shrink-0">
                              {displayedUserDeals.length}
                            </span>
                          </div>
                        </div>

                        {/* Lista de Cards deste Usuário */}
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 w-full px-1.5 py-1.5 no-scrollbar pb-10">
                          {/* Banner Estético de Duração Média que surge ocupando a área do primeiro card */}
                          {hoveredUserSubcolId === group.id && (
                            <div className="w-full h-[88px] min-h-[88px] max-h-[88px] rounded-xl border border-sky-400/50 bg-gradient-to-br from-slate-950/98 via-sky-950/70 to-slate-950/95 backdrop-blur-xl px-3 py-2 flex flex-col items-center justify-center text-center shadow-[0_0_25px_rgba(56,189,248,0.3)] animate-in fade-in zoom-in-95 duration-150 select-none shrink-0 mb-2 relative z-20">
                              <span className="font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.16em] text-slate-300 leading-tight">
                                {getStageDurationLabel(currentStage?.id || currentStage?.title)}
                              </span>
                              <div className="w-20 h-[1.5px] bg-gradient-to-r from-transparent via-sky-400 to-transparent my-1.5" />
                              <span className="font-mono text-sm sm:text-base font-black uppercase tracking-widest text-sky-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.85)] leading-tight">
                                {avgUserDaysFormatted} {avgUserDaysFormatted === "1,0" ? "DIA" : "DIAS"}
                              </span>
                            </div>
                          )}

                          {/* Container das atividades com desfoque no hover do cabeçalho */}
                          <div
                            className={`space-y-2 w-full transition-all duration-300 ${
                              hoveredUserSubcolId === group.id
                                ? "blur-[2.5px] opacity-25 select-none pointer-events-none filter"
                                : "transition-all duration-200"
                            }`}
                          >
                            {topLevelUserDeals.map((deal, idx) => renderDealCard(deal, currentStage.id, isManyUsers, false, idx))}
                          </div>
                        </div>

                        {/* Efeito desfoque suave e gradiente na base da coluna com altura ampliada */}
                        <div className="absolute bottom-0 left-0 right-0 h-14 pointer-events-none bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent backdrop-blur-[2px] rounded-b-2xl z-10" />
                      </div>
                    );
                  })
                )}
              </div>
            );
          }

          // CASO 2: MODO NORMAL (Colunas de Etapas do Kanban com ajuste automático de largura total e sem rolagem lateral)
          return (
            <div className="flex-1 min-h-0 flex gap-2 sm:gap-2.5 h-full overflow-x-hidden overflow-y-hidden pt-1 pb-1 px-0.5 w-full">
              {STAGES.map((stage) => {
                let stageDeals = visibleDeals.filter((d) => d.stage === stage.id);

                if (effectiveFilterUser !== "ALL") {
                  stageDeals = stageDeals.filter((d) => isDealUserMatching(d, effectiveFilterUser));
                }

                const stageTerm = (stageSearchTerms[stage.id] || "").trim().toLowerCase();
                if (stageTerm) {
                  stageDeals = stageDeals.filter(
                    (d) =>
                      d.title?.toLowerCase().includes(stageTerm) ||
                      d.req_number?.toLowerCase().includes(stageTerm) ||
                      getDealReqNumber(d, deals).toLowerCase().includes(stageTerm) ||
                      d.notes?.toLowerCase().includes(stageTerm) ||
                      d.assigned_user_name?.toLowerCase().includes(stageTerm) ||
                      d.creator_name?.toLowerCase().includes(stageTerm) ||
                      (d.customer_name && d.customer_name.toLowerCase().includes(stageTerm))
                  );
                }

                const customOrder = Array.isArray(stageCustomOrders?.[stage.id]) ? stageCustomOrders[stage.id] : [];
                stageDeals = [...stageDeals].sort((a, b) => {
                  const isDealOrSubActive = (deal: Deal) => {
                    if (getDealActiveWorker(deal)) return true;
                    const subtasks = getSubtasksForDeal(deal, deals);
                    return subtasks.some((s) => Boolean(getDealActiveWorker(s)));
                  };
                  const activeA = isDealOrSubActive(a);
                  const activeB = isDealOrSubActive(b);
                  if (activeA && !activeB) return -1;
                  if (!activeA && activeB) return 1;

                  // Atividades aguardando aceite vão para o final da coluna
                  const isPendingA = isDealPendingAuthorAcceptance(a);
                  const isPendingB = isDealPendingAuthorAcceptance(b);
                  if (!isPendingA && isPendingB) return -1;
                  if (isPendingA && !isPendingB) return 1;

                  if (customOrder.length > 0) {
                    const indexA = customOrder.indexOf(a.id);
                    const indexB = customOrder.indexOf(b.id);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                  }
                  const timeA = new Date(a.created_at || a.updated_at || 0).getTime();
                  const timeB = new Date(b.created_at || b.updated_at || 0).getTime();
                  return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
                });

                const isStageSearchOpen = openSearchStageId === stage.id;
                const topLevelDeals = stageDeals.filter(
                  (deal) => !isSubtaskWithParentInPool(deal, stageDeals)
                );

                const avgStageDaysFormatted = (() => {
                  if (!stageDeals || stageDeals.length === 0) return "0,0";
                  const totalDays = stageDeals.reduce((sum, d) => {
                    return sum + getEffectiveCalendarDays(d.created_at);
                  }, 0);
                  return (totalDays / stageDeals.length).toFixed(1).replace(".", ",");
                })();

                const isCollapsed = Boolean(collapsedStages[stage.id]);
                const draggedDeal = draggingDealId ? deals.find((d) => d.id === draggingDealId) : null;
                const isMovingFromAnotherStage = Boolean(draggedDeal && draggedDeal.stage !== stage.id);

                const isLead = stage.id === "lead";
                const isCompleted = stage.id === "completed";
                const isLost = stage.id === "lost";
                
                const stageTheme = isLead
                  ? {
                      stripGradient: "from-amber-500/40 via-amber-500/20 to-transparent hover:from-amber-500/70",
                      stripText: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.9)]",
                      plusBtn: "bg-amber-500/20 text-amber-300 hover:bg-amber-500/35 border border-amber-400/50 hover:border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.35)]",
                      textColor: "text-amber-400",
                      subtextColor: "text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.7)]",
                      dotBg: "bg-amber-400 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.85)]",
                      hoverHeaderBg: "hover:bg-amber-950/40 hover:border-amber-400/50 hover:shadow-[inset_0_1px_20px_rgba(245,158,11,0.25)]",
                      searchBorder: "border-amber-400/50",
                      searchActive: "bg-amber-500/20 text-amber-300 border border-amber-400/40",
                      searchIcon: "text-amber-400",
                    }
                  : isCompleted
                  ? {
                      stripGradient: "from-emerald-500/40 via-emerald-500/20 to-transparent hover:from-emerald-500/70",
                      stripText: "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]",
                      plusBtn: "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/35 border border-emerald-400/50 hover:border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.35)]",
                      textColor: "text-emerald-400",
                      subtextColor: "text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]",
                      dotBg: "bg-emerald-400 text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]",
                      hoverHeaderBg: "hover:bg-emerald-950/40 hover:border-emerald-400/50 hover:shadow-[inset_0_1px_20px_rgba(52,211,153,0.25)]",
                      searchBorder: "border-emerald-400/50",
                      searchActive: "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40",
                      searchIcon: "text-emerald-400",
                    }
                  : isLost
                  ? {
                      stripGradient: "from-rose-500/40 via-rose-500/20 to-transparent hover:from-rose-500/70",
                      stripText: "text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.9)]",
                      plusBtn: "bg-rose-500/20 text-rose-300 hover:bg-rose-500/35 border border-rose-400/50 hover:border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.35)]",
                      textColor: "text-rose-400",
                      subtextColor: "text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.7)]",
                      dotBg: "bg-rose-400 text-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.85)]",
                      hoverHeaderBg: "hover:bg-rose-950/40 hover:border-rose-400/50 hover:shadow-[inset_0_1px_20px_rgba(244,63,94,0.25)]",
                      searchBorder: "border-rose-400/50",
                      searchActive: "bg-rose-500/20 text-rose-300 border border-rose-400/40",
                      searchIcon: "text-rose-400",
                    }
                  : {
                      stripGradient: "from-sky-500/40 via-sky-500/20 to-transparent hover:from-sky-500/70",
                      stripText: "text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.9)]",
                      plusBtn: "bg-sky-500/20 text-sky-300 hover:bg-sky-500/35 border border-sky-400/50 hover:border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.35)]",
                      textColor: "text-sky-400",
                      subtextColor: "text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]",
                      dotBg: "bg-sky-400 text-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.85)]",
                      hoverHeaderBg: "hover:bg-sky-950/40 hover:border-sky-400/50 hover:shadow-[inset_0_1px_20px_rgba(56,189,248,0.25)]",
                      searchBorder: "border-sky-400/50",
                      searchActive: "bg-sky-500/20 text-sky-300 border border-sky-400/40",
                      searchIcon: "text-sky-400",
                    };

                // Renderização da Coluna Oculta / Aba Estreita
                if (isCollapsed) {
                  return (
                    <div
                      key={stage.id}
                      onClick={() => toggleCollapseStage(stage.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverStageId !== stage.id) {
                          setDragOverStageId(stage.id);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverStageId(null);
                        setDragOverTargetDealId(null);
                        const dealId =
                          e.dataTransfer.getData("text/plain") ||
                          draggingDealIdRef.current ||
                          draggingDealId;

                        if (dealId) {
                          const targetDeal = deals.find((d) => d.id === dealId);
                          if (targetDeal) {
                            if (role !== "admin" && targetDeal.assigned_user_id !== user?.id) {
                              return toast.error("Você só pode mover ou alterar atividades sob sua responsabilidade.");
                            }
                            if (targetDeal.stage !== stage.id) {
                              handleMoveStage(targetDeal, stage.id);
                            }
                          }
                        }
                      }}
                      title={`Clique para expandir ${stage.title}\n${getStageDurationLabel(stage.id || stage.title)}: ${avgStageDaysFormatted} ${avgStageDaysFormatted === "1.0" || avgStageDaysFormatted === "1,0" ? "DIA" : "DIAS"}`}
                      className={`glass group/collapsed flex flex-col items-center justify-between rounded-2xl border ${stage.border} ${stage.bg || ""} overflow-hidden shadow-xl transition-all duration-200 h-full max-h-full w-12 sm:w-14 min-w-[48px] sm:min-w-[56px] max-w-[48px] sm:max-w-[56px] py-3 cursor-pointer select-none hover:border-white/40 hover:bg-white/[0.04] ${
                        dragOverStageId === stage.id && isMovingFromAnotherStage ? "ring-2 ring-sky-400 border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.35)] bg-sky-950/40" : ""
                      }`}
                    >
                      {/* Topo da Aba Estreita: Ponto luminoso e contador */}
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className={`h-2.5 w-2.5 rounded-full shadow-[0_0_8px_currentColor] shrink-0 transition-transform group-hover/collapsed:scale-125 ${
                            stage.color.replace("text-", "bg-")
                          }`}
                        />
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-white font-mono shrink-0">
                          {stageDeals.length}
                        </span>
                      </div>

                      {/* Centro: Título da Coluna na Vertical */}
                      <div className="flex-1 flex items-center justify-center my-4">
                        <span
                          style={{ writingMode: "vertical-rl" }}
                          className={`rotate-180 text-xs font-black uppercase tracking-[0.25em] ${stage.color} group-hover/collapsed:text-white transition-colors drop-shadow-sm`}
                        >
                          {stage.title}
                        </span>
                      </div>

                      {/* Base: Ícone de Abertura Lateral para a Direita */}
                      <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover/collapsed:text-white transition-colors">
                        <ChevronsRight className="h-4 w-4 transition-transform group-hover/collapsed:translate-x-0.5" />
                        <span className="text-[8px] font-bold uppercase tracking-wider opacity-60">Abrir</span>
                      </div>
                    </div>
                  );
                }

                // Renderização da Coluna Aberta / Expandida (ocupa toda a largura disponível proporcionalmente)
                return (
                  <div
                    key={stage.id}
                    onClick={(e) => e.stopPropagation()}
                    className={`glass relative group/column flex-1 min-w-0 flex flex-col rounded-2xl border ${stage.border} ${stage.bg || ""} overflow-hidden shadow-xl transition-all h-full max-h-full ${
                      dragOverStageId === stage.id && isMovingFromAnotherStage ? "ring-2 ring-sky-400 border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.35)] bg-sky-950/25" : ""
                    }`}
                  >
                    {/* Botão / Faixa Oculta na margem direita de toda a coluna para recolher */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapseStage(stage.id);
                      }}
                      className={`absolute right-0 top-0 bottom-0 w-11 group/collapse-strip flex flex-col items-center justify-center opacity-0 hover:opacity-100 bg-gradient-to-l ${stageTheme.stripGradient} transition-opacity duration-200 cursor-pointer z-30 select-none`}
                      title={`Recolher coluna ${stage.title}`}
                    >
                      <div className="w-full flex flex-col items-center justify-center gap-2 text-center">
                        <ChevronsLeft className={`h-4 w-4 mx-auto shrink-0 ${stageTheme.stripText}`} />
                        <span className={`inline-block text-center text-[10px] font-black uppercase tracking-[0.2em] leading-none ${stageTheme.stripText} [writing-mode:vertical-rl] rotate-180 py-1.5`}>
                          Recolher
                        </span>
                        <ChevronsLeft className={`h-4 w-4 mx-auto shrink-0 ${stageTheme.stripText}`} />
                      </div>
                    </button>

                    {/* Header da Coluna com Hover Interno */}
                    <div
                      onMouseEnter={() => setHoveredStageHeaderId(stage.id)}
                      onMouseLeave={() => setHoveredStageHeaderId(null)}
                      onClick={() => {
                        setIsolatedStageId((prev) => (prev === stage.id ? null : stage.id));
                      }}
                      className={`group/header shrink-0 flex items-center justify-between p-3 border-b select-none cursor-pointer transition-all duration-200 relative overflow-hidden ${
                        isolatedStageId === stage.id
                          ? "border-white/10 bg-gradient-to-b from-rose-500/20 via-rose-950/40 to-transparent hover:bg-rose-500/25 hover:border-rose-400/50 shadow-[inset_0_1px_15px_rgba(244,63,94,0.15)] hover:shadow-[inset_0_1px_20px_rgba(244,63,94,0.3)]"
                          : `border-white/10 bg-gradient-to-b ${stage.glow} to-transparent ${stageTheme.hoverHeaderBg}`
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`h-2.5 w-2.5 rounded-full shadow-[0_0_10px_currentColor] shrink-0 transition-transform group-hover/header:scale-110 ${
                            isolatedStageId === stage.id
                              ? "bg-rose-400 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.8)]"
                              : `${stage.color.replace("text-", "bg-")} ${stage.color}`
                          }`}
                        />
                        <div className="min-w-0 flex flex-col justify-center">
                          {/* Título da Atividade sempre visível */}
                          <span className={`text-xs font-black uppercase tracking-widest ${stage.color} block truncate leading-tight`}>
                            {stage.title}
                          </span>
                          {/* Surge abaixo do título no hover da coluna */}
                          <span
                            className={`text-[9px] uppercase font-black tracking-wider hidden group-hover/header:block truncate pointer-events-none animate-in fade-in duration-150 leading-none mt-1 ${stageTheme.subtextColor}`}
                          >
                            EXPANDIR ATIVIDADE
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0 relative z-30" onClick={(e) => e.stopPropagation()}>
                        {/* Botão de Adicionar Nova Atividade (+) ao lado da Lupa */}
                        {(stage.id === "lead" || stage.id === "qualification") && (
                          <button
                            type="button"
                            onClick={() => {
                              if (stage.id === "lead") {
                                openNewRequestModal("interna");
                              } else {
                                openNewRequestModal("externa");
                              }
                            }}
                            className={`p-1.5 rounded-lg text-xs transition-all flex items-center justify-center cursor-pointer shadow-sm hover:scale-110 ${stageTheme.plusBtn}`}
                            title={stage.id === "lead" ? "Adicionar Nova Tarefa (+)" : "Adicionar Novo Orçamento (+)"}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <div className="relative flex items-center crm-search-box">
                          {isStageSearchOpen ? (
                            <div className={`flex items-center gap-1 bg-black/80 border ${stageTheme.searchBorder} rounded-lg px-2 py-0.5 animate-in fade-in max-w-[120px] sm:max-w-[140px] shadow-sm`}>
                              <Search className={`h-3 w-3 ${stageTheme.searchIcon} shrink-0`} />
                              <input
                                type="text"
                                placeholder="Pesquisar..."
                                value={stageSearchTerms[stage.id] || ""}
                                onChange={(e) =>
                                   setStageSearchTerms((prev) => ({ ...prev, [stage.id]: e.target.value }))
                                }
                                className="bg-transparent text-[10px] text-white outline-none w-full placeholder:text-white/40 font-medium"
                                autoFocus
                              />
                              {stageSearchTerms[stage.id] ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStageSearchTerms((prev) => ({ ...prev, [stage.id]: "" }))
                                  }
                                  className="text-[10px] text-muted-foreground hover:text-white px-0.5"
                                  title="Limpar busca"
                                >
                                  ✕
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setOpenSearchStageId(null)}
                                  className="text-[10px] text-muted-foreground hover:text-white px-0.5"
                                  title="Fechar busca"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOpenSearchStageId(stage.id)}
                              className={`p-1.5 rounded-lg text-xs transition-all flex items-center gap-1 cursor-pointer ${
                                stageSearchTerms[stage.id]
                                    ? stageTheme.searchActive
                                    : "bg-white/5 text-muted-foreground hover:text-white border border-white/10 hover:border-white/20"
                              }`}
                              title={`Pesquisar em ${stage.title}`}
                            >
                              <Search className="h-3.5 w-3.5" />
                              {stageSearchTerms[stage.id] && (
                                <span className={`w-1.5 h-1.5 rounded-full ${stageTheme.textColor.replace("text-", "bg-")} animate-pulse`} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (dragOverStageId !== stage.id) {
                          setDragOverStageId(stage.id);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverStageId(null);
                        setDragOverTargetDealId(null);
                        const dealId =
                          e.dataTransfer.getData("text/plain") ||
                          draggingDealIdRef.current ||
                          draggingDealId;

                        if (dealId) {
                          const targetDeal = deals.find((d) => d.id === dealId);
                          if (targetDeal) {
                            if (role !== "admin" && targetDeal.assigned_user_id !== user?.id) {
                              return toast.error("Você só pode mover ou alterar atividades sob sua responsabilidade.");
                            }
                            if (targetDeal.stage !== stage.id) {
                              handleMoveStage(targetDeal, stage.id);
                            }
                          }
                        }
                      }}
                      className="flex-1 min-h-0 overflow-y-auto space-y-2 w-full px-1.5 py-1.5 no-scrollbar pb-14"
                    >
                      {/* Banner Estético de Duração Média e Quantidade no topo dos cards */}
                      {hoveredStageHeaderId === stage.id && (() => {
                        const stageTotalValue = stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
                        const formattedStageTotalValue = fmtCurrency(stageTotalValue);

                        return (
                          <div className={`w-full min-h-[96px] max-h-[106px] rounded-xl border ${stageTheme.searchBorder} bg-gradient-to-br from-slate-950/98 via-slate-900/90 to-slate-950/95 backdrop-blur-xl px-3 py-2 flex flex-col items-center justify-center text-center shadow-[0_0_25px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95 duration-150 select-none shrink-0 mb-2 relative z-20`}>
                            <span className={`font-mono text-[10px] sm:text-[11px] font-black uppercase tracking-[0.16em] ${stageTheme.subtextColor} leading-tight`}>
                              {getStageOpenActivitiesLabel(stage.id || stage.title, stageDeals.length)}
                            </span>
                            {stageTotalValue > 0 && (
                              <span className="font-mono text-[11px] font-black uppercase tracking-wider text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.7)] mt-0.5 leading-tight">
                                VALOR TOTAL: {formattedStageTotalValue}
                              </span>
                            )}
                            <div className="w-20 h-[1.5px] bg-gradient-to-r from-transparent via-white/30 to-transparent my-1" />
                            <span className="font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-300 leading-tight">
                              {getStageDurationLabel(stage.id || stage.title)}:{" "}
                              <strong className={`${stageTheme.textColor} font-black text-xs`}>
                                {avgStageDaysFormatted} {avgStageDaysFormatted === "1,0" ? "DIA" : "DIAS"}
                              </strong>
                            </span>
                          </div>
                        );
                      })()}

                      {/* Container das atividades com desfoque no hover do cabeçalho */}
                      <div
                        className={`space-y-2 w-full transition-all duration-300 ${
                          hoveredStageHeaderId === stage.id
                            ? "blur-[2.5px] opacity-25 select-none pointer-events-none filter"
                            : "transition-all duration-200"
                        }`}
                      >
                        {topLevelDeals.length === 0 ? (
                          <div className="h-full min-h-[140px] flex items-center justify-center p-6 border border-dashed border-white/5 rounded-xl text-[11px] uppercase font-bold tracking-widest text-muted-foreground/40 text-center">
                            Sem atividades nesta etapa
                          </div>
                        ) : (
                          <>
                            {topLevelDeals.map((deal, idx) => renderDealCard(deal, stage.id, false, false, idx))}
                            {dragOverStageId === stage.id && isMovingFromAnotherStage && !dragOverTargetDealId && (
                              <div className="w-full py-2.5 px-2 rounded-xl border-2 border-dashed border-sky-400/70 bg-sky-500/10 text-sky-300 flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider animate-pulse shadow-md">
                                <ArrowRight className="h-3.5 w-3.5 text-sky-400" />
                                <span>Mover para {stage.title}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Rodapé da Coluna com Desfoque Gradual / Degradê Idêntico para Todas as Colunas */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (stage.id === "lead" || stage.id === "completed" || stage.id === "lost") {
                          setArchivedFilterStage(stage.id as "lead" | "completed" | "lost");
                          setIsArchivedModalOpen(true);
                        }
                      }}
                      className={`absolute bottom-0 left-0 right-0 p-2 pt-6 bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent backdrop-blur-[4px] rounded-b-2xl z-30 select-none ${
                        (stage.id === "lead" || stage.id === "completed" || stage.id === "lost")
                          ? "pointer-events-auto cursor-pointer"
                          : "pointer-events-none"
                      }`}
                    >
                      {(stage.id === "lead" || stage.id === "completed" || stage.id === "lost") ? (() => {
                        const archivedInStage = getArchivedDealsForStage(stage.id as "lead" | "completed" | "lost", deals);
                        const isLead = stage.id === "lead";
                        const isCompleted = stage.id === "completed";

                        const badgeColor = isLead
                          ? "text-amber-300 border-amber-400/40 bg-amber-500/20"
                          : isCompleted
                          ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/20"
                          : "text-rose-300 border-rose-500/40 bg-rose-500/20";

                        return (
                          <div
                            className="w-full py-1.5 px-2.5 rounded-xl border border-white/10 hover:border-white/25 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md transition-all flex items-center justify-between text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-white group shadow-lg cursor-pointer"
                            title={`Ver ${isLead ? "Tarefas" : isCompleted ? "Concluídos" : "Perdidos"} Arquivadas`}
                          >
                            <div className="flex items-center gap-1.5">
                              <FolderArchive className="h-3.5 w-3.5 text-muted-foreground group-hover:text-white transition-colors" />
                              <span className="text-[10px] sm:text-[11px] font-black tracking-widest text-slate-300 group-hover:text-white">
                                ARQUIVADAS
                              </span>
                            </div>

                            <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full border ${badgeColor} transition-transform group-hover:scale-105`}>
                              {archivedInStage.length}
                            </span>
                          </div>
                        );
                      })() : (
                        <div className="w-full h-[32px]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {selectedDealForHistory && (() => {
        const isPendingModal = isDealPendingAuthorAcceptance(selectedDealForHistory);
        const hasModalDeadline = !isPendingModal && Boolean(selectedDealForHistory.expected_close_date);
        const modalStyle = getInternalDeadlineStyle(selectedDealForHistory.expected_close_date);
        const aging = getDealAgingStyle(selectedDealForHistory.latest_update_at || selectedDealForHistory.created_at);
        const modalBgClass = isPendingModal ? "!bg-black border-2 !border-zinc-700 shadow-2xl text-white" : aging.cardClass;

        return (
          <div
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                modalBackdropMouseDownRef.current = true;
              } else {
                modalBackdropMouseDownRef.current = false;
              }
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && modalBackdropMouseDownRef.current) {
                handleCloseSelectedDealModal();
              }
              modalBackdropMouseDownRef.current = false;
            }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in overflow-hidden"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className={`w-full max-w-4xl max-h-[98vh] h-[98vh] rounded-2xl border p-4 sm:p-5 shadow-2xl flex flex-col backdrop-blur-2xl transition-all overflow-hidden ${modalBgClass}`}
            >
              {/* Header Fixo do Card Expandido com Botão Lateral Quadrado à Esquerda e Textos Centralizados */}
              <div className="shrink-0 flex items-stretch border-b border-white/10 pb-3 relative min-h-[105px]">
                {/* BOTÃO QUADRADO NO CANTO ESQUERDO: INICIAR ATIVIDADE / PARAR ATIVIDADE (Apenas para o responsável atribuído em atividades ativas) */}
                {(() => {
                  const isPending = isPendingModal;
                  const isArchived = selectedDealForHistory.stage === "archived";
                  const isCompleted = selectedDealForHistory.stage === "completed" || selectedDealForHistory.stage === "won" || selectedDealForHistory.stage === "lost";
                  if (isPending || isArchived || isCompleted) return <div className="w-[105px] shrink-0" />;

                  const activeWorker = getDealActiveWorker(selectedDealForHistory);
                  const isWorking = Boolean(activeWorker && activeWorker.userId === user?.id);
                  const isAssigned = selectedDealForHistory.assigned_user_id === user?.id;
                  if (!isAssigned) return <div className="w-[105px] shrink-0" />;

                  return (
                    <button
                      type="button"
                      onClick={() => handleToggleWorkActivity(selectedDealForHistory)}
                      className={`w-[105px] shrink-0 rounded-2xl flex flex-col items-center justify-center p-2.5 transition-all cursor-pointer shadow-lg select-none border text-center group ${
                        isWorking
                          ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-pulse"
                          : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-white border-emerald-500/50 hover:border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)] hover:scale-105"
                      }`}
                      title={isWorking ? "Clique para pausar o trabalho nesta atividade" : "Clique para iniciar o trabalho nesta atividade"}
                    >
                      {isWorking ? (
                        <>
                          <div className="relative flex items-center justify-center mb-1.5">
                            <span className="h-3 w-3 rounded-full bg-rose-500 animate-ping absolute" />
                            <span className="h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
                          </div>
                          <span className="font-mono text-[10px] font-black uppercase tracking-wider leading-tight text-rose-200">
                            PARAR
                          </span>
                          <span className="font-mono text-[9px] font-extrabold uppercase tracking-widest text-rose-400/90">
                            ATIVIDADE
                          </span>
                        </>
                      ) : (
                        <>
                          <Play className="h-6 w-6 text-emerald-400 fill-emerald-400 mb-1.5 transition-transform group-hover:scale-110" />
                          <span className="font-mono text-[10px] font-black uppercase tracking-wider leading-tight text-emerald-200">
                            INICIAR
                          </span>
                          <span className="font-mono text-[9px] font-extrabold uppercase tracking-widest text-emerald-400/90">
                            ATIVIDADE
                          </span>
                        </>
                      )}
                    </button>
                  );
                })()}

                {/* Estrutura Centralizada de Textos do Cabeçalho */}
                <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-4">
                  {/* LINHA 1 - TÍTULO E CLIENTE NA MESMA LINHA + EDIÇÃO DE TÍTULO */}
                  {(() => {
                    const parentInfo = getParentDealInfo(selectedDealForHistory);
                    const isSubtaskModal = Boolean(parentInfo);

                    const dealCust = getDealCustomer(selectedDealForHistory);
                    const modalCustomerName =
                      dealCust?.company_name ||
                      dealCust?.name ||
                      (selectedDealForHistory.customer_name && selectedDealForHistory.customer_name !== "Uso Interno / Empresa"
                        ? selectedDealForHistory.customer_name
                        : null);
                    const isAuthor = isAdmin || selectedDealForHistory.assigned_user_id === user?.id;
                    const cleanTitle = getCleanDealTitle(selectedDealForHistory.title);

                    return (
                      <div className="w-full text-center px-6 pt-0.5">
                        {isEditingTitle ? (
                          <div className="flex items-center justify-center gap-2 max-w-xl mx-auto py-1 animate-in fade-in">
                            <input
                              type="text"
                              value={editingTitleValue}
                              onChange={(e) => setEditingTitleValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveTitle();
                                if (e.key === "Escape") setIsEditingTitle(false);
                              }}
                              autoFocus
                              disabled={isSavingTitle}
                              className="input-futuristic uppercase flex-1 rounded-xl px-3 py-1.5 text-sm font-black text-sky-300 bg-black/80 border border-sky-400 outline-none shadow-inner"
                              placeholder="Novo título da atividade..."
                            />
                            <button
                              type="button"
                              disabled={isSavingTitle || !editingTitleValue.trim()}
                              onClick={handleSaveTitle}
                              className="p-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 cursor-pointer transition-all disabled:opacity-50"
                              title="Salvar novo título"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isSavingTitle}
                              onClick={() => setIsEditingTitle(false)}
                              className="p-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-400/50 cursor-pointer transition-all"
                              title="Cancelar edição"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-center gap-2 max-w-full flex-wrap">
                            <h2
                              className="text-lg sm:text-xl font-black uppercase tracking-wider text-sky-300 leading-snug flex items-center justify-center flex-wrap gap-2"
                              title={
                                modalCustomerName && modalCustomerName.trim() !== ""
                                  ? `${isSubtaskModal ? "[VINCULADA] " : ""}${modalCustomerName.trim().toUpperCase()} - ${cleanTitle}`
                                  : `${isSubtaskModal ? "[VINCULADA] " : ""}${selectedDealForHistory.title}`
                              }
                            >
                              {isSubtaskModal && (
                                <span className="font-mono text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-md bg-sky-500/25 text-sky-300 border border-sky-400/50 uppercase tracking-widest inline-flex items-center justify-center shrink-0 shadow-sm">
                                  VINCULADA
                                </span>
                              )}
                              {modalCustomerName && modalCustomerName.trim() !== "" ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (dealCust) {
                                        setSelectedCustomerForDetails(dealCust);
                                      } else {
                                        toast.info(`Cliente: ${modalCustomerName}`);
                                      }
                                    }}
                                    className="text-sky-300 hover:text-sky-200 hover:underline font-black cursor-pointer transition-colors"
                                    title="Clique para ver a ficha completa do cliente"
                                  >
                                    {modalCustomerName.trim().toUpperCase()}
                                  </button>
                                  {role === "admin" && (
                                    <button
                                      type="button"
                                      onClick={handleStartEditCustomer}
                                      className="p-1 rounded-lg text-white/40 hover:text-sky-300 hover:bg-sky-500/10 border border-transparent hover:border-sky-400/30 transition-all cursor-pointer"
                                      title="Alterar cliente da atividade (Administrador)"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                  <span className="text-sky-300/60 mx-1">-</span>
                                  <span>{cleanTitle}</span>
                                </>
                              ) : role === "admin" ? (
                                <>
                                  <span>{cleanTitle}</span>
                                  <button
                                    type="button"
                                    onClick={handleStartEditCustomer}
                                    className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/30 transition-all cursor-pointer ml-1"
                                    title="Atribuir cliente a esta tarefa / atividade (Administrador)"
                                  >
                                    + Atribuir Cliente
                                  </button>
                                </>
                              ) : (
                                <span>{cleanTitle}</span>
                              )}
                            </h2>

                            {isAuthor && (
                              <button
                                type="button"
                                onClick={handleStartEditTitle}
                                className="p-1 rounded-lg text-white/40 hover:text-sky-300 hover:bg-sky-500/10 border border-transparent hover:border-sky-400/30 transition-all cursor-pointer"
                                title="Alterar título da atividade (responsável)"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* LINHA 2 - ETAPA (CONFORME A ETAPA QUE OCUPA) / NÚMERO DE REGISTRO */}
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300 mt-1">
                    <span className="font-mono font-bold text-slate-300">
                      ETAPA: {STAGES.find((s) => s.id === selectedDealForHistory.stage)?.title || "ATIVIDADE"}
                    </span>
                    <span>•</span>
                    <span className="font-mono font-bold">
                      Nº {getDealReqNumber(selectedDealForHistory, deals)}
                    </span>
                  </div>

                  {/* LINHA DO ORÇAMENTO OFICIAL (Exibe o número do orçamento oficial se anexado/extraído) */}
                  {(() => {
                    const quoteDoc = getDealQuoteFile(selectedDealForHistory, dealHistoryList);
                    const quoteNum = quoteDoc?.quoteData?.quoteNumber;
                    if (!quoteNum) return null;

                    return (
                      <div className="flex items-center justify-center gap-1.5 text-xs font-mono font-black tracking-wider text-emerald-300 mt-0.5">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-[11px] shadow-sm">
                          ORÇAMENTO OFICIAL: Nº {quoteNum}
                        </span>
                      </div>
                    );
                  })()}

                  {/* LINHA 3 - AUTOR, RESPONSÁVEL, CRIAÇÃO (Cor branca homogênea e clicável) */}
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-1">
                    <p>
                      Autor:{" "}
                      <button
                        type="button"
                        onClick={(e) => handleToggleUserFilter(selectedDealForHistory.user_id, e)}
                        className="text-white font-medium hover:underline cursor-pointer uppercase"
                        title={`Filtrar por autor: ${selectedDealForHistory.creator_name || "Autor"}`}
                      >
                        {selectedDealForHistory.creator_name || "Autor"}
                      </button>
                    </p>
                    <span>•</span>
                    <p>
                      Responsável:{" "}
                      <button
                        type="button"
                        onClick={(e) => handleToggleUserFilter(selectedDealForHistory.assigned_user_id, e)}
                        className="text-white font-medium hover:underline cursor-pointer uppercase"
                        title={`Filtrar por responsável: ${selectedDealForHistory.assigned_user_name || "Responsável"}`}
                      >
                        {selectedDealForHistory.assigned_user_name || "Nenhum"}
                      </button>
                    </p>
                    <span>•</span>
                    <p>
                      Criada em: <span className="font-mono text-white/90">{new Date(selectedDealForHistory.created_at).toLocaleString("pt-BR")}</span>
                    </p>
                  </div>

                  {/* LINHA 4 - PRAZO */}
                  {hasModalDeadline && (
                    <div className="flex items-center justify-center gap-2 mt-1">
                      {modalStyle.indicatorBadge && (
                        <span
                          title={modalStyle.hoverText}
                          className={`font-mono text-[9px] font-black px-2 py-0.5 rounded border flex items-center justify-center shadow-sm tracking-tight shrink-0 ${modalStyle.indicatorBadgeClass}`}
                        >
                          {modalStyle.indicatorBadge}
                        </span>
                      )}
                      <p className={`font-mono text-xs font-bold ${modalStyle.colorClass}`}>
                        {formatDeadlineWithWeekday(selectedDealForHistory.expected_close_date)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Botão Fechar no Canto Superior Direito com proteção de texto digitado */}
                <div className="w-[105px] shrink-0 flex items-start justify-end">
                  <button
                    type="button"
                    onClick={handleCloseSelectedDealModal}
                    className="btn-ghost-neon px-2.5 py-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm border border-white/10"
                    title="Fechar detalhes da atividade"
                  >
                    <X className="h-4 w-4" />
                    <span className="text-[10px] font-black uppercase tracking-wider font-mono">Fechar</span>
                  </button>
                </div>
              </div>



              {/* Banner Interativo: Vínculo com Atividade Primária Clicável */}
              {(() => {
                const parentInfo = getParentDealInfo(selectedDealForHistory);
                if (!parentInfo) return null;

                const parentDeal = parentInfo.deal || deals.find((d) => d.id === parentInfo.id || getDealReqNumber(d, deals) === parentInfo.reqNumber);
                const parentCustomer = parentDeal ? getDealCustomer(parentDeal) : null;
                const parentCustomerName =
                  parentCustomer?.company_name ||
                  parentCustomer?.name ||
                  (parentDeal?.customer_name && parentDeal.customer_name !== "Uso Interno / Empresa"
                    ? parentDeal.customer_name
                    : null);

                const cleanParentTitle = getCleanDealTitle(parentInfo.title);

                return (
                  <div className="shrink-0 mt-2 p-2.5 rounded-xl bg-sky-950/70 border border-sky-400/40 flex items-center justify-between gap-3 animate-in fade-in">
                    <div className="flex items-center gap-2.5 text-xs text-sky-200 min-w-0">
                      <div className="p-1 rounded-lg bg-sky-500/20 text-sky-400 shrink-0">
                        <Layers className="h-4 w-4" />
                      </div>
                      <div className="truncate">
                        <span className="text-[10px] font-black uppercase tracking-wider text-sky-400/90 block leading-none">
                          Atividade Principal
                        </span>
                        <span className="font-bold text-sky-300 uppercase text-xs truncate block mt-0.5">
                          {parentCustomerName && (
                            <>
                              <span className="text-sky-300 font-bold">{parentCustomerName.trim().toUpperCase()}</span>
                              <span className="text-sky-300/60 mx-1.5">-</span>
                            </>
                          )}
                          <span className="text-sky-300">{cleanParentTitle}</span>{" "}
                          <span className="font-mono text-sky-300/80">(Nº {parentInfo.reqNumber})</span>
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (parentDeal) {
                          openDealHistory(parentDeal);
                        } else {
                          toast.info(`Atividade Vinculada: ${cleanParentTitle} (Nº ${parentInfo.reqNumber})`);
                        }
                      }}
                      className="btn-ghost-neon px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider text-sky-300 hover:text-white bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 shrink-0 cursor-pointer transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <span>Abrir Atividade</span>
                    </button>
                  </div>
                );
              })()}

              {/* CORPO DO MODAL: LINHA DO TEMPO EM TELA CHEIA DO CARD OU FORMULÁRIO DE DETALHES */}
              {isTimelineOpen ? (
                <div className="flex-1 min-h-0 flex flex-col space-y-3 pt-2.5 overflow-hidden animate-in fade-in duration-200">
                  <div className="shrink-0 flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sky-300">
                      <History className="h-4 w-4 text-accent" /> Linha do Tempo Completa ({unifiedTimelineList.length} eventos)
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsTimelineOpen(false)}
                      className="btn-ghost-neon px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider text-white border-white/20 hover:bg-white/10 flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <span>Voltar</span>
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1.5 custom-scrollbar">
                    {historyLoading ? (
                      <p className="text-xs text-muted-foreground text-center py-12 animate-pulse">Carregando histórico completo...</p>
                    ) : unifiedTimelineList.length === 0 ? (
                      <div className="text-center py-16 border border-dashed border-white/10 rounded-xl">
                        <p className="text-xs text-muted-foreground/60 uppercase font-bold tracking-widest">Nenhum evento registrado ainda nesta atividade.</p>
                      </div>
                    ) : (
                      unifiedTimelineList.map((item) => {
                        const isReply = item.action_type === "reply" || (item as any).isReply;
                        const isSubtaskComp = item.action_type === "subtask_completed" || (item as any).isSubtaskCompletion;

                        return (
                          <div
                            key={item.id}
                            className={`p-3.5 rounded-xl bg-black/40 border space-y-1.5 text-xs shadow-inner transition-all ${
                              isReply
                                ? "border-sky-400/40 bg-sky-950/20 shadow-[0_0_10px_rgba(56,189,248,0.05)] border-l-4 border-l-sky-400"
                                : isSubtaskComp
                                ? "border-emerald-500/40 bg-emerald-950/20 border-l-4 border-l-emerald-400"
                                : "border-white/10"
                            }`}
                          >
                            <div className="flex items-center justify-between text-muted-foreground border-b border-white/5 pb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white uppercase text-[11px] flex items-center gap-1.5">
                                  {isReply ? (
                                    <Reply className="h-3.5 w-3.5 text-sky-400" />
                                  ) : isSubtaskComp ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <UserIcon className="h-3.5 w-3.5 text-accent" />
                                  )}
                                  {item.user_name}
                                </span>
                                {isReply && (
                                  <span className="font-mono text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40 uppercase flex items-center gap-1 shadow-sm">
                                    Resposta
                                  </span>
                                )}
                                {isSubtaskComp && (
                                  <span className="font-mono text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 uppercase flex items-center gap-1 shadow-sm">
                                    Vinculada Concluída
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {new Date(item.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>

                            {/* Renderização Inteligente de Respostas ou Descrições */}
                            {isReply && (item as any).rawReplyText ? (
                              <div className="space-y-1 pt-0.5 pl-2">
                                <p className="text-white/95 text-xs whitespace-pre-wrap leading-relaxed">
                                  {formatMentionsInText((item as any).rawReplyText)}
                                </p>
                              </div>
                            ) : (
                              renderInteractiveDescription(item.description)
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className={`flex-1 min-h-0 flex flex-col ${isPendingModal ? "justify-start h-full" : "justify-between"} pt-2.5 gap-2.5 overflow-hidden`}>
                  {/* Informações do Topo */}
                  <div className={`${isPendingModal ? "flex-1 min-h-0 flex flex-col" : "shrink-0"} space-y-2`}>
                    {selectedDealForHistory.notes && (
                      <div className={`p-3 rounded-xl bg-white/5 border border-white/10 space-y-2 custom-scrollbar ${isPendingModal ? "flex-1 min-h-0 overflow-y-auto" : "max-h-[45vh] overflow-y-auto"}`}>
                        {(() => {
                          const latestHistoryItem = dealHistoryList.length > 0 ? dealHistoryList[0] : null;
                          const latestAuthorName = (latestHistoryItem?.user_name || selectedDealForHistory.latest_update_author || selectedDealForHistory.creator_name || "Autor").toUpperCase();
                          const latestTimestamp = latestHistoryItem?.created_at || selectedDealForHistory.updated_at || selectedDealForHistory.created_at;

                          return (
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                <span className="font-black uppercase tracking-widest text-accent flex items-center gap-1.5 text-xs">
                                  <AlertCircle className="h-4 w-4" /> Última Atualização
                                </span>
                                <span className="text-white/30">•</span>
                                <span className="text-slate-300">
                                  Autor:{" "}
                                  <span className="text-white font-bold uppercase text-xs sm:text-sm">
                                    {latestAuthorName}
                                  </span>
                                </span>
                                <span className="text-white/30">•</span>
                                <span className="text-slate-300">
                                  Responsável:{" "}
                                  <button
                                    type="button"
                                    onClick={(e) => handleToggleUserFilter(selectedDealForHistory.assigned_user_id, e)}
                                    className="text-white font-bold hover:underline cursor-pointer uppercase text-xs sm:text-sm"
                                    title={`Filtrar por responsável: ${selectedDealForHistory.assigned_user_name || "Nenhum"}`}
                                  >
                                    {selectedDealForHistory.assigned_user_name || "Nenhum"}
                                  </button>
                                </span>
                                <span className="text-white/30">•</span>
                                {(() => {
                                  const agingText =
                                    aging.days === 0
                                      ? "Atualizado hoje"
                                      : aging.days === 1
                                      ? "1 dia sem atualização"
                                      : aging.days > 15
                                      ? "+15 dias sem atualização"
                                      : `${aging.days} dias sem atualização`;

                                  return (
                                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
                                      <span className={`h-2 w-2 rounded-full shrink-0 ${aging.dotColor}`} />
                                      <span className={`${aging.accentText} uppercase tracking-wider`}>
                                        {agingText}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                              <span className="text-xs font-mono font-bold text-sky-300 bg-sky-500/10 border border-sky-400/30 px-2.5 py-1 rounded-md flex items-center gap-1.5 shrink-0">
                                <Clock className="h-3.5 w-3.5 text-sky-400" />
                                {new Date(latestTimestamp).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </span>
                            </div>
                          );
                        })()}

                        {(() => {
                          const notes = selectedDealForHistory.notes || "";
                          const cleanNotes = notes
                            .replace(/<!--.*?-->\s*/g, "")
                            .replace(/\[TASK_COMPLETION_NOTIFICATION:.*?\]\s*/g, "")
                            .replace(/\[WORK_ACTIVE:.*?\]\s*/g, "")
                            .replace(/\[WORK_LOG:.*?\]\s*/g, "")
                            .replace(/\[QUOTE_DATA:.*?\]\s*/g, "")
                            .replace(/\[QUOTE_FILE:.*?\]\s*/g, "")
                            .replace(/\[SUBTASK_LINK:.*?\]\s*/g, "")
                            .replace(/\[SUBTASK_COMPLETED:.*?\]\s*/g, "")
                            .replace(/\[SUBTASK_COMPLETION:.*?\]\s*/g, "")
                            .replace(/\[PARENT_DEAL:.*?\]\s*/g, "")
                            .replace(/\[MENTION:.*?\]\s*/g, "")
                            .replace(/\[MENTION_REPLY:.*?\]\s*/g, "")
                            .replace(/\[RESPONSIBLE_LAST_SEEN:.*?\]\s*/g, "")
                            .trim();

                          // Obtém a atualização mais recente: seja do histórico mais recente ou das notas
                          const latestHistoryItem = dealHistoryList.length > 0 ? dealHistoryList[0] : null;
                          const effectiveText = (latestHistoryItem?.description && latestHistoryItem.description.trim()) || cleanNotes;

                          const dealMentions = getDealMentions(selectedDealForHistory);
                          const dealReplies = getDealMentionReplies(selectedDealForHistory);
                          const dealSubtaskCompletions = getDealSubtaskCompletions(selectedDealForHistory);

                          const userMention = dealMentions.find((m) => m.mentioned_user_id === user?.id);
                          const canMarkAsRead = Boolean(userMention && !userMention.read);
                          const isReplyingCurrent = Boolean(replyingToMentionId && (replyingToMentionId === (userMention?.id || dealMentions[0]?.id || "latest_update")));

                          const pendingNotif = getDealCompletionNotifications(selectedDealForHistory).find((n) => n.status === "pending_acceptance");
                          const isAuthor = Boolean(user?.id && selectedDealForHistory.user_id && user.id === selectedDealForHistory.user_id);
                          const quoteDoc = getDealQuoteFile(selectedDealForHistory, dealHistoryList);

                          if (!effectiveText && dealMentions.length === 0 && dealSubtaskCompletions.length === 0 && !isPendingModal) return null;

                          return (
                            <div className="space-y-3">
                              {effectiveText && (
                                isPendingModal ? (
                                  <div className="text-sm leading-relaxed text-slate-100 font-medium bg-amber-950/30 p-4 rounded-2xl border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)] space-y-3">
                                    <div className="flex items-center justify-between border-b border-amber-500/30 pb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                                          <AlertTriangle className="h-4 w-4 animate-pulse" />
                                          Atividade Finalizada pelo Responsável ({pendingNotif?.concluded_by_user_name || selectedDealForHistory.assigned_user_name || "Responsável"})
                                        </span>
                                      </div>
                                      <span className="font-mono text-[10px] text-amber-300">
                                        {new Date(pendingNotif?.created_at || latestTimestamp).toLocaleString("pt-BR")}
                                      </span>
                                    </div>

                                    <div className="text-xs sm:text-sm text-white/95 leading-relaxed pl-1 whitespace-pre-wrap">
                                      {renderInteractiveDescription(pendingNotif?.completion_notes || effectiveText)}
                                    </div>

                                    {/* Documento ou Orçamento Anexado se houver */}
                                    {quoteDoc && (
                                      <div className="pt-2 border-t border-amber-500/20 flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewingQuoteFile({ url: quoteDoc.url, name: quoteDoc.name })}
                                          className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 transition-all cursor-pointer shadow-sm"
                                          title={isBudgetDeal(selectedDealForHistory) ? "Visualizar orçamento anexado" : "Visualizar documento anexado"}
                                        >
                                          <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                                          <span>{isBudgetDeal(selectedDealForHistory) ? "ORÇAMENTO ANEXADO" : "DOCUMENTO ANEXADO"}</span>
                                        </button>
                                        <span className="text-[11px] font-mono text-muted-foreground truncate">{quoteDoc.name}</span>
                                      </div>
                                    )}

                                    {/* BOTÃO DE ACEITE EXCLUSIVO DO AUTOR DA ATIVIDADE */}
                                    <div className="pt-2.5 border-t border-amber-500/30 flex items-center justify-between gap-3 flex-wrap">
                                      {isAuthor ? (
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-3">
                                          <span className="text-xs text-amber-200 font-medium">
                                            A solicitação foi concluída pelo responsável e aguarda o seu aceite para ser arquivada definitivamente.
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleAcceptCompletion(selectedDealForHistory, pendingNotif?.id)}
                                            className="btn-ghost-neon px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-black bg-emerald-400 hover:bg-emerald-300 border border-emerald-300 shrink-0 cursor-pointer transition-all shadow-[0_0_20px_rgba(16,185,129,0.5)] hover:scale-105 flex items-center gap-2"
                                            title="Aceitar a conclusão desta atividade e arquivá-la definitivamente"
                                          >
                                            <CheckCheck className="h-4 w-4" />
                                            <span>Aceitar Conclusão</span>
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-xs text-amber-300/90 italic">
                                          Aguardando aceite de conclusão pelo autor ({selectedDealForHistory.creator_name || "Autor"}).
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-sm leading-relaxed text-slate-100 font-medium bg-black/30 p-3 rounded-xl border border-white/5 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        {renderInteractiveDescription(effectiveText)}
                                      </div>

                                      <div className="shrink-0 flex items-center gap-1.5 ml-2 pt-0.5 select-none">
                                        {canMarkAsRead && (
                                          <button
                                            type="button"
                                            onClick={() => handleMarkMentionAsRead(selectedDealForHistory, userMention.id)}
                                            className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-400/40 hover:scale-110 transition-all cursor-pointer shadow-sm flex items-center justify-center"
                                            title="lido"
                                          >
                                            <Check className="h-4 w-4" />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const targetId = userMention?.id || dealMentions[0]?.id || "latest_update";
                                            setReplyingToMentionId(targetId);
                                          }}
                                          className="p-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-400/40 hover:scale-110 transition-all cursor-pointer shadow-sm flex items-center justify-center"
                                          title="responder"
                                        >
                                          <Reply className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>

                                  {isReplyingCurrent && (() => {
                                    const targetId = userMention?.id || dealMentions[0]?.id || "latest_update";
                                    return (
                                      <div className="relative pt-2 border-t border-white/10 flex items-center gap-1.5 animate-in fade-in">
                                        <input
                                          type="text"
                                          placeholder="Digite sua resposta vinculada a esta atualização..."
                                          value={mentionReplyText[targetId] || ""}
                                          onChange={(e) => {
                                            const text = e.target.value;
                                            const cursor = e.target.selectionStart || 0;
                                            setMentionReplyText((prev) => ({
                                              ...prev,
                                              [targetId]: text,
                                            }));

                                            // Detecta digitação de @ para exibir sugestões de menção
                                            const textBeforeCursor = text.slice(0, cursor);
                                            const atMatch = textBeforeCursor.match(/@([A-Za-z0-9À-ÿ._-]*)$/);
                                            if (atMatch) {
                                              const query = atMatch[1].toLowerCase();
                                              const filtered = teamMembers
                                                .filter((m) => {
                                                  const name = (m.display_name || m.email || "").toLowerCase();
                                                  return name.includes(query);
                                                })
                                                .map((m) => ({ id: m.id, name: m.display_name || m.email || "Usuário" }));
                                              setMentionSuggestions(filtered);
                                              setMentionCursorIndex(cursor - atMatch[0].length);
                                              setActiveMentionInputId(targetId);
                                            } else {
                                              setMentionSuggestions([]);
                                              setMentionCursorIndex(null);
                                              setActiveMentionInputId(null);
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              handleSendMentionReply(selectedDealForHistory, targetId);
                                            }
                                          }}
                                          className="input-futuristic flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none bg-slate-900/90"
                                          autoFocus
                                        />
                                        
                                        {/* Menu de Sugestões de Menção para a Resposta */}
                                        {mentionSuggestions.length > 0 && mentionCursorIndex !== null && activeMentionInputId === targetId && (
                                          <div className="absolute bottom-[110%] left-0 z-50 max-h-48 w-64 overflow-y-auto rounded-xl border border-sky-400/50 bg-slate-950/95 p-1 shadow-2xl backdrop-blur-md custom-scrollbar animate-in fade-in mt-1">
                                            <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-sky-300 border-b border-white/10 flex items-center gap-1.5">
                                              <AtSign className="h-3 w-3 text-sky-400" />
                                              <span>Mencionar Membro</span>
                                            </div>
                                            {mentionSuggestions.map((member) => (
                                              <button
                                                key={member.id}
                                                type="button"
                                                onClick={() => handleSelectMention(member)}
                                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-sky-500/20 text-xs font-bold text-white hover:text-sky-300 flex items-center justify-between transition-colors cursor-pointer"
                                              >
                                                <span className="truncate">{member.name}</span>
                                                <span className="text-[10px] text-sky-400 font-mono">@{member.name.split(" ")[0]}</span>
                                              </button>
                                            ))}
                                          </div>
                                        )}

                                        <div className="shrink-0 flex items-center gap-1.5 ml-2 select-none">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleSendMentionReply(selectedDealForHistory, targetId);
                                            }}
                                            className="p-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-400/40 hover:scale-110 transition-all cursor-pointer shadow-sm flex items-center justify-center"
                                            title="enviar"
                                          >
                                            <Send className="h-4 w-4" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setReplyingToMentionId(null)}
                                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-muted-foreground hover:text-white border border-white/10 hover:scale-110 transition-all cursor-pointer shadow-sm flex items-center justify-center"
                                            title="cancelar"
                                          >
                                            <X className="h-4 w-4" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )
                            )}

                              {/* Lista de Conclusões de Vinculadas com Destaque de Notificação 'NOVA' */}
                              {dealSubtaskCompletions.length > 0 && (
                                <div className="space-y-1.5 pl-3 border-l-2 border-emerald-400/50">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                                    <GitFork className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>Conclusão de Vinculadas ({dealSubtaskCompletions.length}):</span>
                                  </span>
                                  {dealSubtaskCompletions.map((comp) => {
                                    const isNewCompletion =
                                      comp.user_id !== selectedDealForHistory.assigned_user_id &&
                                      (!initialLastSeenTime || new Date(comp.created_at).getTime() > new Date(initialLastSeenTime).getTime());

                                    return (
                                      <div
                                        key={comp.id}
                                        className={`p-2.5 rounded-xl bg-black/40 border text-xs space-y-1.5 transition-all ${
                                          isNewCompletion
                                            ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.15)] ring-1 ring-amber-400/30"
                                            : "border-white/10"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-b border-white/5 pb-1">
                                          <div className="flex items-center gap-1.5 font-bold text-emerald-200 uppercase">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                            <span>{comp.userName} concluiu a vinculada "{comp.subtaskTitle}" (Nº {comp.reqNumber})</span>
                                            {isNewCompletion && (
                                              <span className="ml-1 text-[8px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/25 px-1.5 py-0.5 rounded border border-amber-500/50 animate-pulse shadow-sm">
                                                Nova
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-mono text-[9px]">
                                            {new Date(comp.created_at).toLocaleString("pt-BR")}
                                          </span>
                                        </div>
                                        {comp.completionText && (
                                          <p className="text-white/95 text-xs pl-5 leading-relaxed whitespace-pre-wrap font-medium">
                                            <strong className="text-emerald-300 font-bold">Atualização de Fechamento: </strong>
                                            {formatMentionsInText(comp.completionText)}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {dealReplies.length > 0 && (
                                <div className="space-y-1.5 pl-3 border-l-2 border-sky-400/40">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-300 block">
                                    Respostas ({dealReplies.length}):
                                  </span>
                                  {dealReplies.map((reply) => {
                                    const isNewReply = 
                                      reply.user_id !== selectedDealForHistory.assigned_user_id &&
                                      (!initialLastSeenTime || new Date(reply.created_at).getTime() > new Date(initialLastSeenTime).getTime());

                                    return (
                                      <div
                                        key={reply.id}
                                        className={`p-2 rounded-xl bg-black/40 border text-xs space-y-1 transition-all ${
                                          isNewReply 
                                            ? "border-amber-500/40 bg-amber-500/5 shadow-[0_0_8px_rgba(245,158,11,0.05)]" 
                                            : "border-white/10"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-b border-white/5 pb-1">
                                          <div className="flex items-center gap-1.5 font-bold text-sky-200 uppercase">
                                            <Reply className="h-3 w-3 text-sky-400" />
                                            <span>{reply.user_name}</span>
                                            {isNewReply && (
                                              <span className="ml-1 text-[8px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/20 px-1 py-0.2 rounded border border-amber-500/40 animate-pulse">
                                                Nova
                                              </span>
                                            )}
                                          </div>
                                          <span className="font-mono text-[9px]">
                                            {new Date(reply.created_at).toLocaleString("pt-BR")}
                                          </span>
                                        </div>
                                        <p className="text-white/90 text-xs pl-4 leading-relaxed whitespace-pre-wrap">
                                          {formatMentionsInText(reply.reply_text)}
                                        </p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Formulário de Atualização Integrado (Oculto se a atividade estiver finalizada e aguardando aceite) */}
                  {!isPendingModal && (
                    isAdmin || selectedDealForHistory.assigned_user_id === user?.id ? (
                      <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5 overflow-hidden">
                        <div className="flex-1 min-h-0 flex flex-col p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5">
                          {/* Linha Única de Ações: Tarefa Vinculada, Orçamento, Etapa e Responsável */}
                          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-white/10">
                            {/* Ações da Esquerda: Tarefa Vinculada e Orçamento (Apenas para atividades primárias) */}
                            {(() => {
                              const parentInfo = getParentDealInfo(selectedDealForHistory);
                              const isSubtaskDeal = Boolean(parentInfo);

                              if (isSubtaskDeal) {
                                return (
                                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-sky-950/40 border border-sky-500/30 text-sky-300 text-xs font-bold">
                                    <GitFork className="h-3.5 w-3.5 text-sky-400" />
                                    <span>Vinculada a #{parentInfo?.reqNumber || "Principal"}</span>
                                  </div>
                                );
                              }

                              const quoteDoc = getDealQuoteFile(selectedDealForHistory, dealHistoryList);
                              const isBudget = isBudgetDeal(selectedDealForHistory);
                              const attachLabel = isBudget ? "ANEXAR ORÇAMENTO" : "ANEXAR DOCUMENTO";
                              const attachedLabel = isBudget ? "ORÇAMENTO ANEXADO" : "DOCUMENTO ANEXADO";
                              const tooltipTitle = isBudget ? "Orçamento Anexado" : "Documento Anexado";
                              const buttonHoverTitle = isBudget ? "Clique para selecionar e anexar orçamento" : "Clique para selecionar e anexar documento";
                              const viewHoverTitle = isBudget ? "Clique para visualizar o orçamento anexado" : "Clique para visualizar o documento anexado";

                              return (
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* 1. Vincular Atividade */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubtaskTitle("");
                                      setSubtaskAssignedTo("");
                                      setSubtaskDeadline("");
                                      setSubtaskNotes("");
                                      setIsSubtaskModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 transition-all cursor-pointer shadow-sm"
                                    title="Criar e vincular uma atividade a esta atividade principal"
                                  >
                                    <PlusCircle className="h-3.5 w-3.5 text-emerald-400" /> VINCULAR ATIVIDADE
                                  </button>

                                  {/* 2. Anexo de Arquivo com Compressão Client-side e Tooltip Inteligente */}
                                  <input
                                    ref={quoteFileInputRef}
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={handleUploadQuoteFile}
                                    disabled={isUploadingQuoteFile}
                                    className="hidden"
                                  />

                                  {quoteDoc ? (
                                    <TooltipProvider delayDuration={100}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            disabled={isUploadingQuoteFile}
                                            onClick={() => {
                                              setPreviewingQuoteFile({ url: quoteDoc.url, name: quoteDoc.name });
                                            }}
                                            className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                                            title={viewHoverTitle}
                                          >
                                            <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                                            <span>{attachedLabel}</span>
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          align="start"
                                          sideOffset={8}
                                          className="p-3 rounded-xl bg-slate-950/98 border border-emerald-500/50 text-slate-100 shadow-[0_10px_35px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-[100] min-w-[290px] max-w-[350px] space-y-2 animate-in fade-in zoom-in-95"
                                        >
                                          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                                            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                                              <FileCheck className="h-4 w-4" /> {tooltipTitle}
                                            </span>
                                            <span className="font-mono text-[10px] font-bold text-sky-300 truncate max-w-[150px]">
                                              {quoteDoc.name}
                                            </span>
                                          </div>

                                          {quoteDoc.quoteData?.customerName && (
                                            <div className="text-xs space-y-0.5 text-left">
                                              <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Identificação:</p>
                                              <p className="font-bold text-white leading-tight">
                                                {quoteDoc.quoteData.customerName}
                                              </p>
                                            </div>
                                          )}

                                          {quoteDoc.quoteData?.totalAmount && quoteDoc.quoteData.totalAmount > 0 && (
                                            <div className="flex items-center justify-between text-xs border-t border-white/10 pt-1.5 bg-emerald-500/15 p-2 rounded-lg border border-emerald-400/30">
                                              <span className="text-emerald-300 font-black uppercase text-[11px]">Valor Extraído:</span>
                                              <span className="font-mono font-black text-emerald-400 text-sm">
                                                {`R$ ${quoteDoc.quoteData.totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                              </span>
                                            </div>
                                          )}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isUploadingQuoteFile}
                                      onClick={() => {
                                        quoteFileInputRef.current?.click();
                                      }}
                                      className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-300 hover:text-white bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                                      title={buttonHoverTitle}
                                    >
                                      {isUploadingQuoteFile ? (
                                        <>
                                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                                          <span>COMPACTANDO E ENVIANDO...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                                          <span>{attachLabel}</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Menus da Direita: Etapa e Responsável Juntos */}
                            <div className="flex flex-wrap items-center gap-2">
                              {/* 3. Etapa: [Etapa atual / Mover] */}
                              {(() => {
                                const isInternalDeal =
                                  selectedDealForHistory.title.toLowerCase().includes("[req. interna]") ||
                                  selectedDealForHistory.stage === "lead";

                                const isLinkedSubtask = Boolean(getParentDealInfo(selectedDealForHistory));

                                const currentStageName = STAGES.find((s) => s.id === selectedDealForHistory.stage)?.title || selectedDealForHistory.stage;

                                if (isInternalDeal || isLinkedSubtask) {
                                  return (
                                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs">
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Etapa:</span>
                                      <span className="font-bold text-sky-400 uppercase">{currentStageName}</span>
                                    </div>
                                  );
                                }

                                const curStageIndex = STAGES.findIndex((s) => s.id === (selectedDealForHistory.stage === "proposal" ? "negotiation" : selectedDealForHistory.stage));

                                // Regra: Uma atividade não pode retroceder. Um orçamento não pode passar direto para contratos ou perdidos sem ter passado por negociações.
                                const availableStages = STAGES.filter((s) => {
                                  if (s.id === selectedDealForHistory.stage) return true;
                                  const sIdx = STAGES.findIndex((st) => st.id === s.id);
                                  if (sIdx < curStageIndex) return false; // Bloqueia retrocesso
                                  if (selectedDealForHistory.stage === "qualification") {
                                    // Se está em orçamentos, só pode avançar para negociações
                                    return s.id === "negotiation";
                                  }
                                  if (selectedDealForHistory.stage === "negotiation" || (selectedDealForHistory.stage as string) === "proposal") {
                                    // Se está em negociações, pode ir para CONTRATOS (won) ou PERDIDOS (lost)
                                    return s.id === "won" || s.id === "lost";
                                  }
                                  if (selectedDealForHistory.stage === "won") {
                                    // Se está em contratos, pode ir para CONCLUÍDAS (completed) ou PERDIDOS (lost)
                                    return s.id === "completed" || s.id === "lost";
                                  }
                                  return sIdx === curStageIndex + 1;
                                });

                                const canChangeStage =
                                  role === "admin" ||
                                  !selectedDealForHistory.assigned_user_id ||
                                  selectedDealForHistory.assigned_user_id === user?.id ||
                                  selectedDealForHistory.user_id === user?.id;

                                return (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Etapa:</span>
                                    {canChangeStage && availableStages.length > 1 ? (
                                      <select
                                        value={stageToMove || selectedDealForHistory.stage}
                                        onChange={(e) => {
                                          const targetStage = e.target.value as Deal["stage"];
                                          if (targetStage) {
                                            const originalStage = selectedDealForHistory.stage;
                                            
                                            // Se voltou para a etapa original da atividade antes de atualizar
                                            if (targetStage === originalStage) {
                                              setAutoGeneratedLogs((prev) =>
                                                prev.filter((l) => !l.includes("alterou a etapa de"))
                                              );
                                              setStageToMove(null);
                                              return;
                                            }

                                            if (targetStage === "negotiation") {
                                              const parentInfo = getParentDealInfo(selectedDealForHistory);
                                              const parentDeal = parentInfo?.deal || deals.find((d) => d.id === parentInfo?.id);
                                              const hasQuoteAttached = Boolean(
                                                getDealQuoteFile(selectedDealForHistory, dealHistoryList) ||
                                                (parentDeal && getDealQuoteFile(parentDeal))
                                              );
                                              if (!hasQuoteAttached) {
                                                return toast.error("Não é possível avançar para NEGOCIAÇÕES sem o orçamento anexado.");
                                              }
                                            }

                                            const fromStageName = STAGES.find((s) => s.id === originalStage)?.title || originalStage;
                                            const toStageName = STAGES.find((s) => s.id === targetStage)?.title || targetStage;
                                            const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
                                            const stageLine = `${userName} alterou a etapa de "${fromStageName}" para "${toStageName}".`;
                                            
                                            // Remove alteração anterior de etapa da lista se houver e adiciona a nova
                                            setAutoGeneratedLogs((prev) => [
                                              ...prev.filter((l) => !l.includes("alterou a etapa de")),
                                              stageLine,
                                            ]);
                                            setStageToMove(targetStage);
                                          }
                                        }}
                                        className="input-futuristic rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-transparent text-accent border border-accent/40 outline-none cursor-pointer hover:border-accent"
                                      >
                                        {availableStages.map((s) => (
                                          <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                                            {s.id === (stageToMove || selectedDealForHistory.stage) ? s.title : `➔ ${s.title}`}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="font-bold text-accent uppercase">{currentStageName}</span>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* 4. Responsável: [Usuário] */}
                              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-xs">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                  Responsável:
                                </span>
                                <select
                                  value={reassignTo || selectedDealForHistory.assigned_user_id || ""}
                                  onChange={(e) => {
                                    const selectedId = e.target.value;
                                    setReassignTo(selectedId);
                                    const originalId = selectedDealForHistory.assigned_user_id;

                                    // Remove qualquer log prévio de alteração de responsável desta edição
                                    setAutoGeneratedLogs((prev) =>
                                      prev.filter((l) => !l.includes("alterou o responsável de"))
                                    );

                                    // Se o novo selecionado for diferente do responsável original da atividade, adiciona a linha atualizada
                                    if (selectedId && selectedId !== originalId) {
                                      const selectedMember = teamMembers.find((m) => m.id === selectedId);
                                      const newName = selectedMember?.display_name || selectedMember?.email || "Novo Responsável";
                                      const currentName = selectedDealForHistory.assigned_user_name || "Anterior";
                                      const userName = user?.user_metadata?.display_name || user?.email || "Usuário";
                                      const reassignLine = `${userName} alterou o responsável de "${currentName}" para "${newName}".`;
                                      
                                      setAutoGeneratedLogs((prev) => [
                                        ...prev.filter((l) => !l.includes("alterou o responsável de")),
                                        reassignLine,
                                      ]);
                                    }
                                  }}
                                  className="input-futuristic rounded px-2 py-0.5 text-xs outline-none bg-transparent font-bold border border-white/15 cursor-pointer max-w-[200px]"
                                >
                                  <option value={selectedDealForHistory.assigned_user_id || ""} className="bg-slate-900">
                                    {selectedDealForHistory.assigned_user_name || "Nenhum"}
                                  </option>
                                  {teamMembers
                                    .filter((m) => m.id !== selectedDealForHistory.assigned_user_id)
                                    .map((m) => (
                                      <option key={m.id} value={m.id} className="bg-slate-900">
                                        {m.display_name || m.email}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* FORMULÁRIO DE ATUALIZAÇÃO SEMPRE VISÍVEL E PRONTO PARA DIGITAR */}
                          <form onSubmit={handleAddHistoryOrReassign} className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-hidden">
                            {/* Bloco de Linhas Automáticas Imutáveis */}
                            {autoGeneratedLogs.length > 0 && (
                              <div className="shrink-0 space-y-1.5 p-2.5 rounded-xl bg-sky-950/30 border border-sky-500/20 max-h-[100px] overflow-y-auto custom-scrollbar">
                                {autoGeneratedLogs.map((log, idx) => (
                                  <div key={idx} className="flex items-start gap-2 text-xs font-semibold text-sky-200">
                                    <span className="text-sky-400 font-bold">•</span>
                                    <span className="select-none leading-tight">{log}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="relative flex-1 min-h-[140px] flex flex-col">
                              <textarea
                                placeholder="Descreva a nova atualização desta atividade... Use @ para mencionar um colega (ex: @João)"
                                value={newComment}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const cursor = e.target.selectionStart;
                                  setNewComment(val);

                                  // Detecta digitação de @ para exibir sugestões de menção
                                  const textBeforeCursor = val.slice(0, cursor);
                                  const atMatch = textBeforeCursor.match(/@([A-Za-z0-9À-ÿ._-]*)$/);
                                  if (atMatch) {
                                    const query = atMatch[1].toLowerCase();
                                    const filtered = teamMembers
                                      .filter((m) => {
                                        const name = (m.display_name || m.email || "").toLowerCase();
                                        return name.includes(query);
                                      })
                                      .map((m) => ({ id: m.id, name: m.display_name || m.email || "Usuário" }));
                                    setMentionSuggestions(filtered);
                                    setMentionCursorIndex(cursor - atMatch[0].length);
                                    setActiveMentionInputId("new_comment");
                                  } else {
                                    setMentionSuggestions([]);
                                    setMentionCursorIndex(null);
                                    setActiveMentionInputId(null);
                                  }
                                }}
                                className="input-futuristic flex-1 min-h-[140px] w-full rounded-xl p-3.5 text-xs outline-none resize-none leading-relaxed custom-scrollbar"
                                autoFocus
                              />

                              {/* Menu Flutuante de Autocomplete de Menção (@usuario) */}
                              {mentionSuggestions.length > 0 && mentionCursorIndex !== null && activeMentionInputId === "new_comment" && (
                                <div className="absolute bottom-2 left-2 z-30 max-h-48 w-64 overflow-y-auto rounded-xl border border-sky-400/50 bg-slate-950/95 p-1 shadow-2xl backdrop-blur-md custom-scrollbar animate-in fade-in">
                                  <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-sky-300 border-b border-white/10 flex items-center gap-1.5">
                                    <AtSign className="h-3 w-3 text-sky-400" />
                                    <span>Mencionar Membro</span>
                                  </div>
                                  {mentionSuggestions.map((member) => (
                                    <button
                                      key={member.id}
                                      type="button"
                                      onClick={() => handleSelectMention(member)}
                                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-sky-500/20 text-xs font-bold text-white hover:text-sky-300 flex items-center justify-between transition-colors cursor-pointer"
                                    >
                                      <span className="truncate">{member.name}</span>
                                      <span className="text-[10px] text-sky-400 font-mono">@{member.name.split(" ")[0]}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Botões de Ação */}
                            <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/5">
                              {/* Ações Especiais: Concluir (se vinculada), Desarquivar ou Arquivar (em vermelho) e Atualizar */}
                              {(() => {
                                const parentInfo = getParentDealInfo(selectedDealForHistory);
                                const isLinkedSubtask = Boolean(parentInfo);

                                if (isLinkedSubtask && selectedDealForHistory.stage !== "archived") {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleCompleteSubtask(selectedDealForHistory)}
                                      className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 border border-rose-500/40 hover:border-rose-400 flex items-center gap-1.5 shadow-sm cursor-pointer"
                                      title="Concluir e fechar esta vinculada"
                                    >
                                      <CheckCircle2 className="h-4 w-4 text-rose-400" />
                                      <span>Concluir</span>
                                    </button>
                                  );
                                }

                                const originStage =
                                  selectedDealForHistory.stage === "archived"
                                    ? getArchivedOriginStage(selectedDealForHistory)
                                    : (selectedDealForHistory.stage as "lead" | "completed" | "lost");

                                const isArchivableStage =
                                  originStage === "lead" ||
                                  ((originStage === "completed" || originStage === "lost") && isAdmin);

                                if (!isLinkedSubtask && isArchivableStage) {
                                  return selectedDealForHistory.stage === "archived" ? (
                                    <button
                                      type="button"
                                      onClick={() => handleUnarchiveDeal(selectedDealForHistory)}
                                      className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm cursor-pointer"
                                      title="Desarquivar e restaurar esta atividade ao seu quadro de origem"
                                    >
                                      <ArchiveRestore className="h-4 w-4 text-emerald-400" />
                                      <span>Desarquivar</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleArchiveDeal(selectedDealForHistory)}
                                      className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-red-500 hover:text-red-300 bg-red-500/15 hover:bg-red-500/25 border-2 !border-red-500 hover:!border-red-400 flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.35)] hover:shadow-[0_0_20px_rgba(239,68,68,0.55)] cursor-pointer transition-all hover:scale-105"
                                      style={{ borderColor: "#ef4444", color: "#ef4444" }}
                                      title="Arquivar esta atividade totalmente finalizada"
                                    >
                                      <Archive className="h-4 w-4 text-red-500" style={{ color: "#ef4444" }} />
                                      <span className="text-red-500 font-black" style={{ color: "#ef4444" }}>Arquivar</span>
                                    </button>
                                  );
                                }

                                return null;
                              })()}

                              <button
                                type="submit"
                                disabled={isSavingUpdate}
                                className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 border border-sky-500/30 flex items-center gap-1.5 shadow-sm cursor-pointer"
                              >
                                <Save className="h-4 w-4 text-sky-400" />
                                <span>{isSavingUpdate ? "Gravando..." : "Atualizar"}</span>
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-3 shrink-0">
                        <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                          <Lock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-bold uppercase tracking-wider text-[11px] text-amber-300">
                            Modo de Apenas Leitura
                          </p>
                          <p className="text-white/80 mt-0.5 leading-relaxed">
                            Apenas o responsável pela atividade pode inserir novas atualizações, alterar a etapa ou reatribuir. Você pode responder às atualizações.
                          </p>
                        </div>
                      </div>
                    )
                  )}

                  {/* Botão de Expansão da Linha do Tempo */}
                  <button
                    type="button"
                    onClick={() => setIsTimelineOpen(true)}
                    className="shrink-0 w-full flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 transition-all text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-white shadow-sm"
                  >
                    <span className="flex items-center gap-2">
                      <History className="h-4 w-4 text-accent" /> Abrir Linha do Tempo
                    </span>
                    <span className="text-[10px] font-mono font-bold text-accent px-2 py-0.5 rounded bg-accent/10 border border-accent/20">
                      {unifiedTimelineList.length} {unifiedTimelineList.length === 1 ? "evento" : "eventos"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
      );
    })()}

      {/* Modal: Abertura de Requisição (Interna ou Externa) */}
      {/* Modal: Abertura de Requisição (Interna ou Externa) com Ocupação Vertical Completa */}
      {activeReqModal && (
        <div
          onClick={() => setActiveReqModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in overflow-hidden"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-4xl rounded-2xl border border-white/15 p-5 sm:p-6 flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 pb-3 border-b border-white/10">
              <h3 className="text-sm font-black uppercase tracking-widest text-gradient flex items-center gap-2">
                {activeReqModal === "interna" ? (
                  <>
                    <Building className="h-4 w-4 text-sky-400" /> Nova Tarefa Interna
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 text-accent" /> Novo Orçamento Comercial
                  </>
                )}
              </h3>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                {activeReqModal === "interna"
                  ? "Atividade interna da empresa (sem cliente e sem faturamento)."
                  : "Atividade comercial da empresa (com cliente, proposta e faturamento)."}
              </p>
            </div>

            <form onSubmit={handleCreateDeal} className="flex flex-col space-y-4 pt-3">
              {/* Campos do Topo - Mesma Linha para Título, Cliente, Prazo e Direcionamento */}
              {activeReqModal === "interna" ? (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  {/* Título da Tarefa */}
                  <div className="md:col-span-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Título da Tarefa <span className="text-rose-400">*</span>
                      </label>
                      <span className={`text-[10px] font-mono font-bold ${newDealTitle.trim().split(/\s+/).filter(Boolean).length > 6 ? "text-rose-400" : "text-sky-400"}`}>
                        {newDealTitle.trim().split(/\s+/).filter(Boolean).length}/6 palavras
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Verificar vazamento no compressor..."
                      value={newDealTitle}
                      onChange={(e) => setNewDealTitle(e.target.value.toUpperCase())}
                      className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                    />
                  </div>

                  {/* Cliente (Opcional para Tarefas) */}
                  <div className="md:col-span-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                      Cliente (Opcional)
                    </label>
                    <select
                      value={newDealCustomerId}
                      onChange={(e) => {
                        if (e.target.value === "__NEW__") {
                          setIsNewCustomerModalOpen(true);
                        } else {
                          setNewDealCustomerId(e.target.value);
                        }
                      }}
                      className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60 font-semibold"
                    >
                      <option value="">
                        Uso Interno (Sem cliente)
                      </option>
                      <option value="__NEW__" className="text-sky-300 font-bold bg-slate-900">
                        + CADASTRAR NOVO CLIENTE...
                      </option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id} className="bg-slate-900">
                          {c.company_name || c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Prazo para Execução */}
                  <div className="md:col-span-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                      Prazo <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={newDealDeadline}
                      onChange={(e) => setNewDealDeadline(e.target.value)}
                      className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                    />
                  </div>

                  {/* Direcionamento / Responsável */}
                  <div className="md:col-span-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                      Direcionamento <span className="text-rose-400">*</span>
                    </label>
                    <select
                      required
                      value={newDealAssignedTo}
                      onChange={(e) => setNewDealAssignedTo(e.target.value)}
                      className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60 font-bold"
                    >
                      <option value="">Selecione o responsável</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id} className="bg-slate-900 font-bold">
                          {m.display_name || m.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                /* Se for Orçamento -> Título, Cliente, Responsável e Prazo na Mesma Linha */
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Título do Orçamento <span className="text-rose-400">*</span>
                      </label>
                      <span className={`text-[10px] font-mono font-bold ${newDealTitle.trim().split(/\s+/).filter(Boolean).length > 6 ? "text-rose-400" : "text-sky-400"}`}>
                        {newDealTitle.trim().split(/\s+/).filter(Boolean).length}/6 palavras
                      </span>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Manutenção preventiva em secador..."
                      value={newDealTitle}
                      onChange={(e) => setNewDealTitle(e.target.value.toUpperCase())}
                      className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                      Cliente <span className="text-rose-400">*</span>
                    </label>
                    <select
                      required
                      value={newDealCustomerId}
                      onChange={(e) => {
                        if (e.target.value === "__NEW__") {
                          setIsNewCustomerModalOpen(true);
                        } else {
                          setNewDealCustomerId(e.target.value);
                        }
                      }}
                      className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60 font-semibold"
                    >
                      <option value="" disabled>
                        Selecione o cliente
                      </option>
                      <option value="__NEW__" className="text-sky-300 font-bold bg-slate-900">
                        + CADASTRAR NOVO CLIENTE...
                      </option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id} className="bg-slate-900">
                          {c.company_name || c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                      Responsável <span className="text-rose-400">*</span>
                    </label>
                    <select
                      required
                      value={newDealAssignedTo}
                      onChange={(e) => setNewDealAssignedTo(e.target.value)}
                      className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60 font-bold"
                    >
                      <option value="">Selecione o responsável</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id} className="bg-slate-900 font-bold">
                          {m.display_name || m.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                      Prazo de Envio
                    </label>
                    <input
                      type="date"
                      value={newDealDeadline}
                      onChange={(e) => setNewDealDeadline(e.target.value)}
                      className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                    />
                  </div>
                </div>
              )}

              {/* INSTRUÇÕES DA ATIVIDADE - Campo Grande para Estimular Detalhamento */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-sky-300 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-sky-400" /> INSTRUÇÕES DETALHADAS DA ATIVIDADE <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Descreva detalhadamente o escopo, orientações e critérios de execução
                  </span>
                </div>
                <textarea
                  required
                  placeholder={
                    activeReqModal === "interna"
                      ? "Descreva detalhadamente todo o escopo da tarefa interna, orientações passo a passo para o responsável, especificações técnicas, prioridades, recomendações e critérios de entrega..."
                      : "Descreva detalhadamente todo o escopo do orçamento comercial, histórico e orientações sobre o cliente, detalhes e necessidades dos equipamentos, observações técnicas para elaboração da proposta ou visita..."
                  }
                  value={newDealNotes}
                  onChange={(e) => setNewDealNotes(e.target.value)}
                  className="input-futuristic w-full h-[220px] sm:h-[260px] rounded-xl p-4 text-xs outline-none resize-none leading-relaxed custom-scrollbar font-medium"
                />
              </div>

              {/* Rodapé com Botões de Ação */}
              <div className="shrink-0 flex justify-end gap-2.5 pt-3 border-t border-white/10 mt-1">
                <button
                  type="button"
                  onClick={() => setActiveReqModal(null)}
                  className="btn-ghost-neon rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-futuristic rounded-xl px-6 py-2.5 text-xs font-bold uppercase tracking-wider shadow-lg"
                >
                  Criar {activeReqModal === "interna" ? "Tarefa" : "Orçamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Fechar Contrato & Sincronizar Fluxo de Caixa */}
      {contractModalDeal && (
        <div
          onClick={() => setContractModalDeal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-md rounded-2xl border border-emerald-500/40 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 glow">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-white">
                  Fechar Contrato 🎉
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Integração direta com o Fluxo de Caixa
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Negócio:</span>
                <span className="font-bold text-white uppercase">{contractModalDeal.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-bold text-white">{contractModalDeal.customer_name}</span>
              </div>
              <div className="flex justify-between border-t border-white/5 pt-1.5">
                <span className="text-muted-foreground">Valor Total:</span>
                <span className="font-mono font-black text-emerald-400">
                  {fmtCurrency(contractModalDeal.value)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  Condição de Pagamento / Parcelas
                </label>
                <select
                  value={contractInstallments}
                  onChange={(e) => setContractInstallments(Number(e.target.value))}
                  className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black/60"
                >
                  <option value={1} className="bg-slate-900">À vista (1x de {fmtCurrency(contractModalDeal.value)})</option>
                  <option value={2} className="bg-slate-900">2 parcelas de {fmtCurrency(contractModalDeal.value / 2)}</option>
                  <option value={3} className="bg-slate-900">3 parcelas de {fmtCurrency(contractModalDeal.value / 3)}</option>
                  <option value={6} className="bg-slate-900">6 parcelas de {fmtCurrency(contractModalDeal.value / 6)}</option>
                  <option value={12} className="bg-slate-900">12 parcelas de {fmtCurrency(contractModalDeal.value / 12)}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  Primeiro Vencimento
                </label>
                <input
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => setContractModalDeal(null)}
                className="btn-ghost-neon rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleConfirmWonContract}
                className="btn-futuristic rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                {isSyncing ? "Integrando..." : "Lançar no Financeiro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Central de Alertas para Administradores */}
      {isAdminAlertsOpen && (
        <div
          onClick={() => setIsAdminAlertsOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-2xl rounded-2xl border border-amber-500/30 p-6 space-y-5 shadow-2xl my-8"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Bell className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                    Central de Alertas ADM
                    <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px]">
                      {totalAdminAlerts}
                    </span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Monitoramento automático de prazos ultrapassados e devoluções aos criadores
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAdminAlertsOpen(false)}
                className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
              {/* Seção 1: Prazos Ultrapassados */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> Prazos Ultrapassados ({overdueAlerts.length})
                  </h4>
                </div>

                {overdueAlerts.length === 0 ? (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-muted-foreground/60 text-center">
                    Nenhuma atividade com prazo vencido. Tudo em dia!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {overdueAlerts.map((deal) => {
                      const deadline = getDeadlineInfo(deal.expected_close_date);
                      const reqNum = getDealReqNumber(deal, deals);
                      return (
                        <div
                          key={deal.id}
                          onClick={() => {
                            setIsAdminAlertsOpen(false);
                            openDealHistory(deal);
                          }}
                          className="p-3.5 rounded-xl bg-black/70 hover:bg-black/90 border border-red-500/50 hover:border-red-400 transition-all cursor-pointer flex items-center justify-between gap-3 group shadow-md"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40">
                                Nº {reqNum}
                              </span>
                              <span className="text-xs font-black uppercase text-white truncate group-hover:text-red-300">
                                {deal.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                              <span>Autor: <strong className="text-white">{deal.creator_name || "Autor"}</strong></span>
                              <span>Responsável: <strong className="text-emerald-400">{deal.assigned_user_name}</strong></span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-red-400 font-mono block">
                              {deadline.hoverText}
                            </span>
                            <span className="text-[10px] text-accent hover:underline font-bold mt-0.5 block">
                              Ver detalhes →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Seção 2: Atividades Devolvidas ao Criador */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                    <RotateCcw className="h-4 w-4" /> Devolvidas ao Criador Original ({returnedAlerts.length})
                  </h4>
                </div>

                {returnedAlerts.length === 0 ? (
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-muted-foreground/60 text-center">
                    Nenhuma devolução de atividade registrada recentemente.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {returnedAlerts.map((deal) => {
                      const reqNum = getDealReqNumber(deal, deals);
                      return (
                        <div
                          key={deal.id}
                          onClick={() => {
                            setIsAdminAlertsOpen(false);
                            openDealHistory(deal);
                          }}
                          className="p-3.5 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/40 hover:border-amber-400 transition-all cursor-pointer flex items-center justify-between gap-3 group shadow-md"
                        >
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40">
                                Nº {reqNum}
                              </span>
                              <span className="text-xs font-black uppercase text-white truncate group-hover:text-amber-300">
                                {deal.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                              <span>Criador & Responsável Atual: <strong className="text-emerald-400">{deal.creator_name}</strong></span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 rounded block">
                              Devolvida ao Criador
                            </span>
                            <span className="text-[10px] text-accent hover:underline font-bold mt-1 block">
                              Ver histórico →
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Calendário de Prazos de Atividades */}
      {isCalendarModalOpen && (
        <div
          onClick={() => setIsCalendarModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-3xl rounded-2xl border border-sky-500/30 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 max-h-[90vh] flex flex-col overflow-hidden"
          >
            {/* Cabeçalho do Calendário */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/10 pb-4 gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 shadow-[0_0_15px_rgba(56,189,248,0.2)] shrink-0">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
                    Calendário de Prazos
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {role === "admin"
                      ? "Acompanhamento geral de vencimentos (Todos os Usuários ou por Responsável)"
                      : "Acompanhamento visual dos vencimentos das suas atividades atribuídas"
                    }
                  </p>
                </div>
              </div>

              {/* Ações no Canto Superior Direito: Filtro ADM, VOLTAR e FECHAR */}
              <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                {role === "admin" && (
                  <select
                    value={calendarUserFilter}
                    onChange={(e) => setCalendarUserFilter(e.target.value)}
                    className="input-futuristic rounded-xl px-2.5 py-1.5 text-xs outline-none bg-black text-white font-bold border border-white/20 cursor-pointer max-w-[200px]"
                    title="Filtrar por Responsável"
                  >
                    <option value="ALL">Todos os Responsáveis</option>
                    {teamMembers.map((p) => (
                      <option key={p.id} value={p.id} className="bg-slate-900">
                        {p.display_name || p.email}
                      </option>
                    ))}
                  </select>
                )}

                {calendarSelectedDate && (
                  <button
                    type="button"
                    onClick={() => setCalendarSelectedDate(null)}
                    className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-sky-400 hover:text-white bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 cursor-pointer shadow-sm transition-all"
                  >
                    <ArrowLeft className="h-4 w-4" /> VOLTAR
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCalendarModalOpen(false)}
                  className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 cursor-pointer shadow-sm transition-all"
                  title="Fechar modal"
                >
                  <X className="h-4 w-4" /> FECHAR
                </button>
              </div>
            </div>

            {/* Conteúdo do Calendário em Grade Mensal ou Lista do Dia Selecionado */}
            {(() => {
              // Atividades ativas com prazo definido respeitando o usuário / ADM
              const activeDealsWithDeadline = deals.filter((d) => {
                const hasDeadline = Boolean(d.expected_close_date) && d.stage !== "archived" && d.stage !== "won" && d.stage !== "completed" && d.stage !== "lost" && !isDealPendingAuthorAcceptance(d);
                if (!hasDeadline) return false;

                if (role !== "admin") {
                  return d.assigned_user_id === user?.id;
                }

                if (calendarUserFilter === "ALL") return true;
                if (calendarUserFilter === "unassigned") return !d.assigned_user_id;
                return d.assigned_user_id === calendarUserFilter;
              });

              // Agrupamento por data (YYYY-MM-DD)
              const dealsByDate: Record<string, Deal[]> = {};
              activeDealsWithDeadline.forEach((deal) => {
                const dateKey = deal.expected_close_date?.split("T")[0] || "";
                if (dateKey) {
                  if (!dealsByDate[dateKey]) dealsByDate[dateKey] = [];
                  dealsByDate[dateKey].push(deal);
                }
              });

              // Cálculo dos dias do mês selecionado
              const currentYear = calendarViewDate.getFullYear();
              const currentMonth = calendarViewDate.getMonth();

              const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
              const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

              const daysInMonth = lastDayOfMonth.getDate();
              const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Domingo, 1 = Segunda, etc.

              // Formatação do nome do mês atual
              const monthName = firstDayOfMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              const todayStr = new Date().toISOString().split("T")[0];

              // Navegação de Mês
              const handlePrevMonth = () => {
                setCalendarViewDate(new Date(currentYear, currentMonth - 1, 1));
              };
              const handleNextMonth = () => {
                setCalendarViewDate(new Date(currentYear, currentMonth + 1, 1));
              };
              const handleTodayMonth = () => {
                const today = new Date();
                setCalendarViewDate(today);
                setCalendarSelectedDate(todayStr);
              };

              const weekDays = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];

              // SE UM DIA FOI CLICADO: Exibe a tela de atividades daquele dia na mesma dimensão
              if (calendarSelectedDate) {
                const selectedDeals = dealsByDate[calendarSelectedDate] || [];
                const formattedSelectedDate = new Date(calendarSelectedDate + "T12:00:00").toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  weekday: "long",
                });

                return (
                  <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden animate-in fade-in">
                    {/* Barra Superior da Visão do Dia */}
                    <div className="shrink-0 flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black uppercase tracking-wider text-white capitalize pl-1">
                          {formattedSelectedDate}
                        </h4>
                      </div>

                      <span className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 font-mono text-xs font-black border border-sky-400/40">
                        {selectedDeals.length} {selectedDeals.length === 1 ? "ATIVIDADE" : "ATIVIDADES"}
                      </span>
                    </div>

                    {/* Lista em Tela Cheia das Atividades do Dia Selecionado */}
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                      {selectedDeals.length === 0 ? (
                        <div className="p-12 text-center rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                          <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                          <p className="text-sm font-semibold text-muted-foreground">
                            Nenhuma atividade cadastrada com vencimento nesta data.
                          </p>
                        </div>
                      ) : (
                        selectedDeals.map((deal) => {
                          const reqNum = getDealReqNumber(deal, deals);
                          const deadline = getDeadlineInfo(deal.expected_close_date);
                          const stageTitle = STAGES.find((s) => s.id === deal.stage)?.title || deal.stage;
                          const cardCustomer = getDealCustomer(deal);
                          const customerName = cardCustomer?.company_name || cardCustomer?.name || deal.customer_name;
                          const aging = getDealAgingStyle(deal.latest_update_at || deal.created_at);

                          const agingLabel =
                            aging.days === 0
                              ? "atualizado hoje"
                              : aging.days === 1
                              ? "1 dia sem atualização"
                              : aging.days > 15
                              ? "+15 dias sem atualização"
                              : `${aging.days} dias sem atualização`;

                          return (
                            <div
                              key={deal.id}
                              onClick={() => {
                                setIsCalendarModalOpen(false);
                                openDealHistory(deal);
                              }}
                              className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group shadow-md hover:shadow-xl hover:border-white/30 ${aging.cardClass}`}
                            >
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-[10px] font-black px-2.5 py-0.5 rounded-md bg-black/50 text-sky-300 border border-sky-400/40 shadow-inner">
                                    Nº {reqNum}
                                  </span>
                                  <span className="text-sm font-black uppercase text-white truncate group-hover:text-sky-300">
                                    {deal.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                                  </span>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-black/40 px-2 py-0.5 rounded border border-white/10">
                                    Etapa: <strong className="text-sky-400">{stageTitle}</strong>
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                                  {customerName && customerName !== "Uso Interno / Empresa" && (
                                    <span>Cliente: <strong className="text-slate-200">{customerName}</strong></span>
                                  )}
                                  <span>Responsável: <strong className="text-emerald-400">{deal.assigned_user_name || "Não atribuído"}</strong></span>
                                  <span className={`flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-wider ${aging.accentText}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${aging.dotColor} shadow-[0_0_6px_currentColor]`} />
                                    {agingLabel}
                                  </span>
                                </div>
                              </div>

                              <div className="text-left sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-white/10">
                                <span className={`text-xs font-mono font-black ${deadline.colorClass || "text-slate-300"}`}>
                                  {deadline.hoverText || formatDeadlineWithWeekday(deal.expected_close_date)}
                                </span>
                                <span className="text-xs text-sky-400 font-bold uppercase group-hover:underline mt-1">
                                  Abrir Atividade →
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              }

              // VISÃO PADRÃO: Grade do Mês em Tamanho Amplo
              return (
                <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden animate-in fade-in">
                  {/* Barra de Navegação do Mês */}
                  <div className="shrink-0 flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="btn-ghost-neon p-2 rounded-lg text-slate-300 hover:text-white border border-white/10 hover:border-white/25 cursor-pointer"
                        title="Mês anterior"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="btn-ghost-neon p-2 rounded-lg text-slate-300 hover:text-white border border-white/10 hover:border-white/25 cursor-pointer"
                        title="Próximo mês"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <h4 className="text-base font-black uppercase tracking-wider text-white capitalize pl-3">
                        {monthName}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTodayMonth}
                        className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-400/40 hover:bg-sky-500/30 cursor-pointer transition-all"
                      >
                        Hoje
                      </button>
                    </div>
                  </div>

                  {/* Grade Completa do Calendário com Células Espaçosas */}
                  <div className="flex-1 min-h-0 bg-slate-950/70 border border-white/10 rounded-2xl p-4 shadow-inner flex flex-col justify-between">
                    {/* Cabeçalho dos Dias da Semana */}
                    <div className="grid grid-cols-7 gap-2 mb-3 text-center">
                      {weekDays.map((wd, i) => (
                        <div
                          key={wd}
                          className={`text-xs font-mono font-black uppercase tracking-widest py-1.5 rounded-lg ${
                            i === 0 || i === 6 ? "text-slate-400 bg-white/[0.02]" : "text-sky-300 bg-sky-950/30 border border-sky-500/20"
                          }`}
                        >
                          {wd}
                        </div>
                      ))}
                    </div>

                    {/* Grade de Células dos Dias */}
                    <div className="grid grid-cols-7 gap-2 flex-1 auto-rows-fr">
                      {/* Espaçadores para o início do mês */}
                      {Array.from({ length: startingDayOfWeek }).map((_, idx) => (
                        <div key={`empty-${idx}`} className="rounded-xl bg-transparent opacity-20 pointer-events-none" />
                      ))}

                      {/* Dias do Mês */}
                      {Array.from({ length: daysInMonth }).map((_, idx) => {
                        const dayNum = idx + 1;
                        const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                        const dayDeals = dealsByDate[dateKey] || [];
                        const hasDeals = dayDeals.length > 0;
                        const isToday = dateKey === todayStr;

                        const isOverdue = hasDeals && (
                          dateKey < todayStr ||
                          dayDeals.some((d) => (getDeadlineInfo(d.expected_close_date).diffDays ?? 0) < 0)
                        );

                        return (
                          <button
                            key={dateKey}
                            type="button"
                            onClick={() => setCalendarSelectedDate(dateKey)}
                            className={`min-h-[58px] rounded-xl p-2 flex flex-col items-center justify-between border transition-all select-none relative cursor-pointer ${
                              isToday
                                ? "bg-white/[0.04] border-2 border-white text-white shadow-[0_0_15px_rgba(255,255,255,0.25)] hover:bg-white/10 hover:scale-[1.03] z-10"
                                : hasDeals
                                ? isOverdue
                                  ? "bg-rose-950/40 border-2 border-rose-500/80 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.3)] hover:border-rose-400 hover:bg-rose-900/50 hover:scale-[1.03]"
                                  : "bg-sky-950/50 border border-sky-500/40 text-sky-200 hover:border-sky-400 hover:bg-sky-900/60 hover:scale-[1.03] shadow-md"
                                : "bg-white/[0.02] border border-white/5 text-muted-foreground/60 hover:bg-white/5 hover:border-white/20 hover:text-white hover:scale-[1.02]"
                            }`}
                          >
                            <span
                              className={`text-xs sm:text-sm font-mono font-bold leading-none ${
                                isToday
                                  ? "text-white font-black"
                                  : isOverdue
                                  ? "text-rose-400 font-black"
                                  : hasDeals
                                  ? "text-sky-300 font-bold"
                                  : "text-muted-foreground/60 font-medium"
                              }`}
                            >
                              {dayNum}
                            </span>

                            {hasDeals ? (
                              <div className="flex items-center gap-1 w-full justify-center">
                                <span
                                  className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full leading-none flex items-center gap-1 ${
                                    isToday
                                      ? "bg-white text-slate-950 shadow-[0_0_12px_rgba(255,255,255,0.6)]"
                                      : isOverdue
                                      ? "bg-rose-600 text-white shadow-[0_0_10px_rgba(244,63,94,0.7)]"
                                      : "bg-sky-400 text-slate-950 shadow-[0_0_10px_rgba(56,189,248,0.7)]"
                                  }`}
                                >
                                  {dayDeals.length} {dayDeals.length === 1 ? "atividade" : "atividades"}
                                </span>
                              </div>
                            ) : isToday ? (
                              <span className="text-[9px] font-black text-white uppercase tracking-widest leading-none">
                                Hoje
                              </span>
                            ) : (
                              <span className="text-[8px] font-mono text-muted-foreground/30 uppercase tracking-wider leading-none">
                                -
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal: Atualização Obrigatória ao Mover de Coluna */}
      {movingDealState && (
        <div
          onClick={() => setMovingDealState(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-lg rounded-2xl border border-white/15 p-6 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-black px-2.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40">
                    Nº {getDealReqNumber(movingDealState.deal, deals)}
                  </span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Mover de Etapa
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-sm">
                  {movingDealState.deal.title.replace(/^\[REQ\.\s*(INTERNA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovingDealState(null)}
                className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Transição de Etapa Visual */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground block">Etapa Atual</span>
                <span className="text-xs font-black uppercase text-slate-300">
                  {STAGES.find((s) => s.id === movingDealState.deal.stage)?.title || movingDealState.deal.stage}
                </span>
              </div>
              <div className="text-accent text-base font-black">➔</div>
              <div className="space-y-0.5 text-right">
                <span className="text-[9px] font-bold uppercase tracking-widest text-accent block">Nova Etapa</span>
                <span className="text-xs font-black uppercase text-accent">
                  {STAGES.find((s) => s.id === movingDealState.targetStage)?.title || movingDealState.targetStage}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmMoveStage} className="space-y-3.5">
              {/* Descrever Atualização (Obrigatório) */}
              {/* Descrever Nova Atualização / Atividade Atual (Obrigatório) */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1 mb-1">
                  <FileText className="h-3 w-3 text-accent" /> Descrever Nova Atualização / Atividade Atual <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  autoFocus
                  value={movingDealState.updateText}
                  onChange={(e) =>
                    setMovingDealState((prev) =>
                      prev ? { ...prev, updateText: e.target.value } : null
                    )
                  }
                  placeholder="Descreva o que foi realizado/definido nesta etapa (esta mensagem será a nova Atividade Atual)..."
                  className="input-futuristic w-full rounded-xl p-3 text-xs outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Encaminhar para outro membro (opcional) */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                  Encaminhar Responsável (Opcional)
                </label>
                <select
                  value={movingDealState.reassignTo}
                  onChange={(e) =>
                    setMovingDealState((prev) =>
                      prev ? { ...prev, reassignTo: e.target.value } : null
                    )
                  }
                  className="input-futuristic w-full rounded-xl p-2.5 text-xs outline-none"
                >
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id} className="bg-slate-900 text-white">
                      {member.display_name || member.email} {member.id === movingDealState.deal.assigned_user_id ? "(Atual)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setMovingDealState(null)}
                  className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingMove}
                  className="btn-futuristic px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-950 flex items-center gap-1.5 shadow-lg shadow-accent/20"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>{isSavingMove ? "Salvando..." : "Salvar e Mover"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Repositório de Atividades Arquivadas (Tarefas, Concluídos e Perdidos) */}
      {isArchivedModalOpen && (() => {
        const leadArchivedCount = getArchivedDealsForStage("lead", deals).length;
        const completedArchivedCount = getArchivedDealsForStage("completed", deals).length;
        const lostArchivedCount = getArchivedDealsForStage("lost", deals).length;
        const allArchivedCount = leadArchivedCount + completedArchivedCount + lostArchivedCount;

        const stageTitle =
          archivedFilterStage === "lead"
            ? "Tarefas Arquivadas"
            : archivedFilterStage === "completed"
            ? "Concluídos Arquivados"
            : archivedFilterStage === "lost"
            ? "Perdidos Arquivados"
            : "Atividades Arquivadas";

        const stageSubtitle =
          archivedFilterStage === "lead"
            ? "Repositório de tarefas internas finalizadas e arquivadas."
            : archivedFilterStage === "completed"
            ? "Repositório de atividades comerciais concluídas, com follow-up finalizado e arquivadas."
            : archivedFilterStage === "lost"
            ? "Repositório de atividades comerciais perdidas e arquivadas."
            : "Repositório de atividades finalizadas das colunas Tarefas, Concluídos e Perdidos.";

        return (
          <div
            onClick={() => setIsArchivedModalOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in overflow-y-auto"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl rounded-2xl border border-sky-500/30 bg-slate-950/95 p-6 space-y-4 shadow-2xl my-8 backdrop-blur-xl transition-all max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                    <FolderArchive className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                      {stageTitle}
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/40">
                        {archivedDealsList.length} {archivedDealsList.length === 1 ? "atividade" : "atividades"}
                      </span>
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {stageSubtitle}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsArchivedModalOpen(false)}
                  className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Controles de Filtro: Origem da Etapa e Período (Data, Semana, Mês) */}
              <div className="space-y-2 shrink-0">
                {/* Linha 1: Abas por Origem da Coluna */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 shrink-0 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setArchivedFilterStage("ALL")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        archivedFilterStage === "ALL"
                          ? "bg-white/15 text-white border border-white/30 shadow-sm"
                          : "text-muted-foreground hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <span>Todas as Origens</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-white">
                        {allArchivedCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setArchivedFilterStage("lead")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        archivedFilterStage === "lead"
                          ? "bg-sky-500/20 text-sky-300 border border-sky-400/50 shadow-sm"
                          : "text-muted-foreground hover:text-sky-300 hover:bg-sky-500/10"
                      }`}
                    >
                      <span>Tarefas</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300">
                        {leadArchivedCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setArchivedFilterStage("completed")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        archivedFilterStage === "completed"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 shadow-sm"
                          : "text-muted-foreground hover:text-emerald-300 hover:bg-emerald-500/10"
                      }`}
                    >
                      <span>Concluídos</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300">
                        {completedArchivedCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setArchivedFilterStage("lost")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                        archivedFilterStage === "lost"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-400/50 shadow-sm"
                          : "text-muted-foreground hover:text-rose-300 hover:bg-rose-500/10"
                      }`}
                    >
                      <span>Perdidos</span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300">
                        {lostArchivedCount}
                      </span>
                    </button>
                  </div>

                  {/* Contador de Atividades Filtradas */}
                  <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                    <span>Exibindo:</span>
                    <strong className="text-white font-bold">{archivedDealsList.length}</strong>
                    <span>de</span>
                    <strong className="text-sky-300">{allArchivedCount}</strong>
                  </div>
                </div>

                {/* Linha 2: Filtros por Período (Todas, Hoje, Esta Semana, Este Mês, Data Específica) */}
                <div className="flex items-center justify-between gap-2 flex-wrap p-1.5 rounded-xl bg-black/50 border border-white/10">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 pl-1 pr-2">
                      <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                      Período:
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setArchivedPeriodFilter("ALL");
                        setArchivedCustomDate("");
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        archivedPeriodFilter === "ALL"
                          ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Todo o Período
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setArchivedPeriodFilter("today");
                        setArchivedCustomDate("");
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        archivedPeriodFilter === "today"
                          ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Hoje
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setArchivedPeriodFilter("week");
                        setArchivedCustomDate("");
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        archivedPeriodFilter === "week"
                          ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Esta Semana
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setArchivedPeriodFilter("month");
                        setArchivedCustomDate("");
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        archivedPeriodFilter === "month"
                          ? "bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      Este Mês
                    </button>
                  </div>

                  {/* Filtro por Data Específica */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400">Por Data:</span>
                    <input
                      type="date"
                      value={archivedCustomDate}
                      onChange={(e) => {
                        setArchivedCustomDate(e.target.value);
                        if (e.target.value) {
                          setArchivedPeriodFilter("custom");
                        } else {
                          setArchivedPeriodFilter("ALL");
                        }
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-mono outline-none border transition-all cursor-pointer ${
                        archivedPeriodFilter === "custom" && archivedCustomDate
                          ? "bg-cyan-950/80 text-cyan-200 border-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                          : "bg-black/60 text-slate-300 border-white/15 hover:border-white/30"
                      }`}
                    />
                    {archivedCustomDate && (
                      <button
                        type="button"
                        onClick={() => {
                          setArchivedCustomDate("");
                          setArchivedPeriodFilter("ALL");
                        }}
                        className="btn-ghost-neon p-1 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer text-xs font-bold"
                        title="Limpar filtro de data específica"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Linha 3: Campo de Busca com Ícone e Botão Limpar */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar por Nº de registro, título, responsável, cliente ou notas..."
                    value={archivedSearchTerm}
                    onChange={(e) => setArchivedSearchTerm(e.target.value)}
                    className="input-futuristic w-full rounded-xl pl-10 pr-10 py-2.5 text-xs outline-none bg-black/50"
                  />
                  {archivedSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setArchivedSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Lista de Atividades Arquivadas */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[300px] max-h-[55vh] custom-scrollbar">
                {archivedDealsList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
                    <Archive className="h-10 w-10 text-white/20" />
                    <p className="text-xs font-semibold uppercase tracking-wider">
                      {archivedSearchTerm ? "Nenhuma atividade arquivada encontrada para a busca" : "Nenhuma atividade arquivada nesta categoria"}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {archivedDealsList.map((d) => {
                      const originStage = getArchivedOriginStage(d);
                      const originBadge =
                        originStage === "lead"
                          ? { label: "TAREFA", cls: "bg-sky-500/20 text-sky-300 border-sky-400/30" }
                          : originStage === "completed"
                          ? { label: "CONCLUÍDO", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" }
                          : { label: "PERDIDO", cls: "bg-rose-500/20 text-rose-300 border-rose-500/30" };

                      const cardCustomer = getDealCustomer(d);
                      const customerName = cardCustomer?.company_name || cardCustomer?.name || d.customer_name;

                      return (
                        <div
                          key={d.id}
                          className="p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-sky-400/40 transition-all space-y-2.5 shadow-sm flex flex-col justify-between"
                        >
                          <div className="space-y-1.5 min-w-0">
                            <div className="flex items-center justify-between gap-1 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[9px] font-black px-2 py-0.5 rounded bg-white/10 text-white border border-white/15">
                                  Nº {getDealReqNumber(d, deals)}
                                </span>
                                <span className={`font-mono text-[8px] font-black px-1.5 py-0.5 rounded border ${originBadge.cls}`}>
                                  {originBadge.label}
                                </span>
                              </div>
                              <span className="text-[9px] text-muted-foreground font-mono truncate">
                                {new Date(d.updated_at || d.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>

                            <h4
                              className="text-xs font-bold text-white uppercase tracking-wide truncate cursor-pointer hover:text-sky-300"
                              onClick={() => {
                                setIsArchivedModalOpen(false);
                                openDealHistory(d);
                              }}
                              title="Clique para ver detalhes e histórico"
                            >
                              {getCleanDealTitle(d.title)}
                            </h4>

                            {customerName && customerName !== "Uso Interno / Empresa" && (
                              <p className="text-[10px] text-slate-300 truncate">
                                Cliente: <strong className="text-white font-medium">{customerName}</strong>
                              </p>
                            )}

                            <p className="text-[10px] text-muted-foreground truncate">
                              Resp: <strong className="text-emerald-400 font-medium">{d.assigned_user_name || "Sem responsável"}</strong>
                            </p>
                          </div>

                          {/* Botões de Ação */}
                          <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-white/5">
                            <button
                              type="button"
                              onClick={() => {
                                setIsArchivedModalOpen(false);
                                openDealHistory(d);
                              }}
                              className="btn-ghost-neon px-2.5 py-1 rounded-lg text-sky-300 hover:text-white hover:bg-sky-500/20 transition-colors text-[10px] uppercase font-bold flex items-center gap-1 cursor-pointer"
                              title="Ver histórico e notas"
                            >
                              <History className="h-3 w-3" />
                              <span>Detalhes</span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              {(originStage === "lead" || isAdmin) && (
                                <button
                                  type="button"
                                  onClick={() => handleUnarchiveDeal(d)}
                                  className="btn-ghost-neon px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-[10px] font-black uppercase flex items-center gap-1 hover:scale-105 transition-all cursor-pointer"
                                  title={`Restaurar para a coluna de ${originStage === "lead" ? "Tarefas" : originStage === "completed" ? "Concluídos" : "Perdidos"}`}
                                >
                                  <ArchiveRestore className="h-3 w-3 text-emerald-400" />
                                  <span>Restaurar</span>
                                </button>
                              )}

                              {role === "admin" && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDeal(d)}
                                  disabled={isDeletingDeal}
                                  className="btn-ghost-neon p-1 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 border border-rose-500/30 transition-all cursor-pointer"
                                  title="Excluir permanentemente"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Rodapé Informativo Simples */}
              <div className="shrink-0 flex items-center justify-between pt-3 border-t border-white/10 text-[11px] text-muted-foreground font-mono">
                <span>Total exibido: {archivedDealsList.length} {archivedDealsList.length === 1 ? "atividade" : "atividades"}</span>
                <span className="text-[10px] text-muted-foreground/60 italic">Clique fora para fechar</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Ficha Completa e Detalhes do Cliente */}
      {selectedCustomerForDetails && (
        <div
          onClick={() => {
            setSelectedCustomerForDetails(null);
            setIsEditingCustomerCard(false);
          }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] rounded-2xl border border-sky-400/30 bg-slate-950/95 p-5 sm:p-6 shadow-2xl flex flex-col backdrop-blur-2xl transition-all text-white overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/40">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
                    {selectedCustomerForDetails.company_name || selectedCustomerForDetails.name}
                  </h3>
                  <p className="text-xs text-sky-300 font-semibold uppercase tracking-wider">
                    Ficha Completa do Cliente
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && !isEditingCustomerCard && (
                  <button
                    type="button"
                    onClick={handleStartEditCustomerCard}
                    className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-sky-400 hover:text-sky-300 border border-sky-400/30 hover:border-sky-400 flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Editar dados cadastrais do cliente (Administrador)"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Editar Dados</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dados Cadastrais: Modo Exibição vs Modo Edição */}
            <div className="flex-1 overflow-y-auto space-y-4 py-4 custom-scrollbar">
              {isEditingCustomerCard ? (
                <form onSubmit={handleSaveCustomerCard} className="space-y-4">
                  <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-400/30 space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Editando Dados do Cliente
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          Razão Social / Nome da Empresa
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: INDÚSTRIA SILVA LTDA"
                          value={editCustCompany}
                          onChange={(e) => setEditCustCompany(e.target.value.toUpperCase())}
                          className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          CNPJ / CPF
                        </label>
                        <input
                          type="text"
                          placeholder="00.000.000/0001-00"
                          value={editCustDoc}
                          onChange={(e) => setEditCustDoc(e.target.value)}
                          className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          Contato Principal
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: João da Silva"
                          value={editCustName}
                          onChange={(e) => setEditCustName(e.target.value.toUpperCase())}
                          className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          E-mail de Contato
                        </label>
                        <input
                          type="email"
                          placeholder="contato@empresa.com"
                          value={editCustEmail}
                          onChange={(e) => setEditCustEmail(e.target.value)}
                          className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                          Telefone / WhatsApp
                        </label>
                        <input
                          type="text"
                          placeholder="(11) 98765-4321"
                          value={editCustPhone}
                          onChange={(e) => setEditCustPhone(e.target.value)}
                          className="input-futuristic w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        disabled={isSavingCustDetails}
                        onClick={() => setIsEditingCustomerCard(false)}
                        className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingCustDetails}
                        className="btn-futuristic px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        <span>{isSavingCustDetails ? "Salvando..." : "Salvar Alterações"}</span>
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      Nome da Empresa / Razão Social
                    </span>
                    <p className="text-xs font-bold text-white uppercase">
                      {selectedCustomerForDetails.company_name || "-"}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      CNPJ / CPF
                    </span>
                    <p className="text-xs font-mono font-bold text-sky-300">
                      {selectedCustomerForDetails.document || "-"}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      Contato Principal
                    </span>
                    <p className="text-xs font-bold text-white uppercase">
                      {selectedCustomerForDetails.name || "-"}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      E-mail de Contato
                    </span>
                    <p className="text-xs font-mono text-slate-200 truncate">
                      {selectedCustomerForDetails.email ? (
                        <a
                          href={`mailto:${selectedCustomerForDetails.email}`}
                          className="text-sky-400 hover:underline"
                        >
                          {selectedCustomerForDetails.email}
                        </a>
                      ) : (
                        "-"
                      )}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      Telefone / WhatsApp
                    </span>
                    <p className="text-xs font-mono text-slate-200">
                      {selectedCustomerForDetails.phone ? (
                        <a
                          href={`https://wa.me/${selectedCustomerForDetails.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline inline-flex items-center gap-1.5"
                        >
                          <Phone className="h-3 w-3" />
                          {selectedCustomerForDetails.phone}
                        </a>
                      ) : (
                        "-"
                      )}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block">
                      Status do Cliente
                    </span>
                    <p className="text-xs font-bold uppercase text-emerald-400 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {selectedCustomerForDetails.status || "Ativo"}
                    </p>
                  </div>
                </div>
              )}

              {/* Atividades Vinculadas a este Cliente */}
              {(() => {
                const customerDeals = deals.filter(
                  (d) =>
                    d.customer_id === selectedCustomerForDetails.id ||
                    (selectedCustomerForDetails.company_name &&
                      d.customer_name?.toUpperCase() === selectedCustomerForDetails.company_name.toUpperCase()) ||
                    (selectedCustomerForDetails.name &&
                      d.customer_name?.toUpperCase() === selectedCustomerForDetails.name.toUpperCase())
                );

                return (
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-sky-300 flex items-center gap-2">
                        <FolderKanban className="h-4 w-4 text-accent" />
                        Atividades Vinculadas ({customerDeals.length})
                      </span>
                    </div>

                    {customerDeals.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center border border-dashed border-white/10 rounded-xl">
                        Nenhuma atividade vinculada a este cliente no momento.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-[30vh] overflow-y-auto custom-scrollbar pr-1">
                        {customerDeals.map((d) => (
                          <div
                            key={d.id}
                            className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-2 hover:border-sky-400/40 transition-all"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white uppercase truncate">
                                {d.title.replace(/^\[(REQ\.\s*INTERNA|TAREFA|ORÇAMENTO|VISITA\s*TÉCNICA)\]\s*/i, "")}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                <span className="font-mono text-sky-300 font-bold">
                                  Nº {getDealReqNumber(d, deals)}
                                </span>
                                <span>•</span>
                                <span className="text-white/80 uppercase">
                                  {STAGES.find((s) => s.id === d.stage)?.title || d.stage}
                                </span>
                                <span>•</span>
                                <span className="text-muted-foreground uppercase">
                                  {d.assigned_user_name || "Sem responsável"}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomerForDetails(null);
                                openDealHistory(d);
                              }}
                              className="btn-ghost-neon px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-sky-300 hover:text-white bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 shrink-0 cursor-pointer"
                            >
                              Abrir
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-end border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={() => setSelectedCustomerForDetails(null)}
                className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white border border-white/20 hover:bg-white/10 cursor-pointer transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Exclusivo: Cadastro de Novo Cliente */}
      {isNewCustomerModalOpen && (
        <div
          onClick={() => setIsNewCustomerModalOpen(false)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-xl rounded-2xl border border-sky-400/30 bg-slate-950/95 p-5 sm:p-6 shadow-2xl flex flex-col backdrop-blur-2xl transition-all text-white overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/40">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    Cadastrar Novo Cliente
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Preencha os dados da empresa. O cliente será vinculado automaticamente ao formulário de orçamento.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(false)}
                className="btn-ghost-neon p-1.5 rounded-lg text-muted-foreground hover:text-white cursor-pointer"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveNewCustomer} className="space-y-3 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Razão Social / Nome da Empresa */}
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Nome da Empresa / Razão Social <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: APEX MANUTENÇÃO E PEÇAS LTDA"
                    value={inlineCompanyName}
                    onChange={(e) => setInlineCompanyName(e.target.value.toUpperCase())}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                    autoFocus
                  />
                </div>

                {/* CNPJ */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    CNPJ <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={18}
                    placeholder="00.000.000/0000-00"
                    value={inlineCustomerDoc}
                    onChange={(e) => setInlineCustomerDoc(formatCNPJ(e.target.value))}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none font-mono"
                  />
                </div>

                {/* Contato Principal */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Contato Principal <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nome do responsável"
                    value={inlineContactName}
                    onChange={(e) => setInlineContactName(e.target.value.toUpperCase())}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs uppercase font-bold outline-none"
                  />
                </div>

                {/* E-mail */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    E-mail de Contato <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="contato@empresa.com.br"
                    value={inlineCustomerEmail}
                    onChange={(e) => setInlineCustomerEmail(e.target.value.toLowerCase())}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none font-mono"
                  />
                </div>

                {/* Telefone / WhatsApp */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Telefone / WhatsApp <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={16}
                    placeholder="(00) 0 0000-0000"
                    value={inlineCustomerPhone}
                    onChange={(e) => setInlineCustomerPhone(formatPhone(e.target.value))}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none font-mono"
                  />
                </div>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-2.5 pt-4 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                  className="btn-ghost-neon rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="btn-futuristic rounded-xl px-5 py-2 text-xs font-bold uppercase tracking-wider shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4" />
                  {isSavingCustomer ? "Cadastrando..." : "Cadastrar e Vincular"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Pré-visualização do Documento de Orçamento Oficial */}
      {previewingQuoteFile && (
        <div
          onClick={() => setPreviewingQuoteFile(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-6 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl h-[90vh] rounded-2xl border border-white/20 bg-slate-950 p-4 sm:p-5 shadow-2xl flex flex-col text-white relative overflow-hidden"
          >
            {/* Header da Visualização */}
            <div className="shrink-0 flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 truncate pr-4">
                <FileCheck className="h-5 w-5 text-emerald-400 shrink-0" />
                <span className="font-bold text-sm uppercase tracking-wider truncate text-sky-300">
                  {previewingQuoteFile.name}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href={previewingQuoteFile.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={previewingQuoteFile.name}
                  className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-emerald-400 hover:text-white border-emerald-500/40 hover:bg-emerald-500/20 flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Baixar arquivo original"
                >
                  <Download className="h-4 w-4" /> Download
                </a>

                <label className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-sky-400 hover:text-white border-sky-400/40 hover:bg-sky-500/20 flex items-center gap-1.5 cursor-pointer shadow-sm">
                  <UploadCloud className="h-4 w-4" />
                  <span>Substituir</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleUploadQuoteFile}
                    disabled={isUploadingQuoteFile}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={async () => {
                    await handleRemoveQuoteFile();
                    setPreviewingQuoteFile(null);
                  }}
                  className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 border-rose-500/40 flex items-center gap-1.5 cursor-pointer"
                  title="Excluir orçamento oficial"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Excluir</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewingQuoteFile(null)}
                  className="btn-ghost-neon p-1.5 rounded-xl text-muted-foreground hover:text-white cursor-pointer ml-1"
                  title="Fechar visualizador"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Conteúdo do Documento */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-2 mt-2 bg-black/60 rounded-xl border border-white/5 overflow-hidden">
              {previewingQuoteFile.url.includes("application/pdf") || previewingQuoteFile.name.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewingQuoteFile.url}
                  title={previewingQuoteFile.name}
                  className="w-full h-full rounded-lg border-0"
                />
              ) : (
                <img
                  src={previewingQuoteFile.url}
                  alt={previewingQuoteFile.name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Exclusivo: Criar Atividade Vinculada em Tela Isolada */}
      {isSubtaskModalOpen && selectedDealForHistory && (
        <div
          onClick={() => setIsSubtaskModalOpen(false)}
          className="fixed inset-0 z-[65] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-5 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl border border-emerald-500/40 bg-slate-950/95 p-5 sm:p-6 shadow-2xl flex flex-col backdrop-blur-2xl transition-all text-white space-y-4 shadow-emerald-950/30"
          >
            {/* Header do Modal Isolado */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5 truncate">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black uppercase tracking-wider text-white truncate">
                    Criar Vinculada
                  </h3>
                  <p className="text-xs text-emerald-300 font-bold uppercase truncate mt-0.5">
                    Vinculada à: {getCleanDealTitle(selectedDealForHistory.title)} (Nº {getDealReqNumber(selectedDealForHistory, deals)})
                  </p>
                </div>
              </div>
            </div>

            {/* Formulário de Criação da Vinculada */}
            <form onSubmit={handleCreateSubtask} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                {/* Título da Vinculada */}
                <div className="md:col-span-6">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Título da Vinculada <span className="text-rose-400">*</span>
                    </label>
                    <span className={`text-[10px] font-mono font-bold ${subtaskTitle.trim().split(/\s+/).filter(Boolean).length > 6 ? "text-rose-400" : "text-emerald-400"}`}>
                      {subtaskTitle.trim().split(/\s+/).filter(Boolean).length}/6 palavras
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="Ex: Orçar... Avaliar... Planejar... Verificar... Comprar..."
                    value={subtaskTitle}
                    onChange={(e) => setSubtaskTitle(e.target.value.toUpperCase())}
                    className="input-futuristic w-full rounded-xl px-3.5 py-2 text-xs uppercase font-bold outline-none"
                    required
                    autoFocus
                  />
                </div>

                {/* Prazo */}
                <div className="md:col-span-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Prazo (Opcional)
                  </label>
                  <input
                    type="date"
                    value={subtaskDeadline}
                    onChange={(e) => setSubtaskDeadline(e.target.value)}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black text-white cursor-pointer font-mono"
                  />
                </div>

                {/* Responsável */}
                <div className="md:col-span-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-1">
                    Responsável <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={subtaskAssignedTo}
                    onChange={(e) => setSubtaskAssignedTo(e.target.value)}
                    className="input-futuristic w-full rounded-xl px-3 py-2 text-xs outline-none bg-black text-white cursor-pointer font-bold"
                    required
                  >
                    <option value="">Selecione o responsável...</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id} className="bg-slate-900">
                        {m.display_name || m.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Instruções Grandes e Detalhadas */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-emerald-300 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-emerald-400" /> INSTRUÇÕES DETALHADAS DA VINCULADA
                  </label>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    Descreva todas as orientações e critérios para o responsável
                  </span>
                </div>
                <textarea
                  placeholder="Descreva detalhadamente todas as orientações, detalhes técnicos, prioridades ou recomendações para o responsável executar esta atividade vinculada..."
                  value={subtaskNotes}
                  onChange={(e) => setSubtaskNotes(e.target.value)}
                  className="input-futuristic w-full h-[200px] sm:h-[240px] rounded-xl p-4 text-xs outline-none resize-none leading-relaxed custom-scrollbar font-medium"
                />
              </div>

              <div className="text-[10px] text-muted-foreground/80 bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                * A vinculada será criada automaticamente na mesma coluna da atividade mãe e exibirá o vínculo em seu cabeçalho.
              </div>

              {/* Botões do Rodapé */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsSubtaskModalOpen(false)}
                  className="btn-ghost-neon rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSubtask}
                  className="btn-futuristic rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-wider shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <PlusCircle className="h-4 w-4" />
                  {isCreatingSubtask ? "Criando..." : "Criar Vinculada"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Modal de Conflito de Atividade em Andamento */}
      {workingConflictModal && (
        <div
          onClick={() => setWorkingConflictModal(null)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-amber-400/50 bg-slate-950 p-5 sm:p-6 shadow-2xl flex flex-col text-white space-y-4 shadow-amber-950/40 animate-in zoom-in-95"
          >
            <div className="flex items-center gap-3 pb-3 border-b border-white/10">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/40 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black uppercase tracking-wider text-amber-300">
                  Atividade em Andamento
                </h3>
                <p className="text-xs text-slate-300">
                  Você já possui uma atividade iniciada neste momento.
                </p>
              </div>
            </div>

            {/* Detalhes da Atividade Anterior vs Nova Atividade */}
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-1">
                <span className="font-mono text-[10px] font-black uppercase tracking-widest text-amber-400 block">
                  ATIVIDADE ATUAL EM ANDAMENTO:
                </span>
                <p className="font-bold text-white uppercase text-sm truncate">
                  {getCleanDealTitle(workingConflictModal.previousDeal.title)}
                </p>
                <p className="text-muted-foreground font-mono text-[11px]">
                  Nº {getDealReqNumber(workingConflictModal.previousDeal, deals)} • Etapa: {STAGES.find((s) => s.id === workingConflictModal.previousDeal.stage)?.title || workingConflictModal.previousDeal.stage}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-sky-950/20 border border-sky-500/30 space-y-1">
                <span className="font-mono text-[10px] font-black uppercase tracking-widest text-sky-400 block">
                  NOVA ATIVIDADE QUE DESEJA INICIAR:
                </span>
                <p className="font-bold text-white uppercase text-sm truncate">
                  {getCleanDealTitle(workingConflictModal.targetDeal.title)}
                </p>
                <p className="text-muted-foreground font-mono text-[11px]">
                  Nº {getDealReqNumber(workingConflictModal.targetDeal, deals)} • Etapa: {STAGES.find((s) => s.id === workingConflictModal.targetDeal.stage)?.title || workingConflictModal.targetDeal.stage}
                </p>
              </div>

              <p className="text-center text-slate-300 text-xs pt-1">
                Como deseja prosseguir?
              </p>
            </div>

            {/* Ações */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  // Prosseguir com a anterior: fecha o modal e abre o histórico da anterior
                  const prev = workingConflictModal.previousDeal;
                  setWorkingConflictModal(null);
                  openDealHistory(prev);
                }}
                className="btn-ghost-neon px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-400/40 cursor-pointer text-center transition-all"
              >
                Prosseguir com a Anterior
              </button>

              <button
                type="button"
                onClick={() => {
                  // Fechar a anterior e iniciar a nova
                  const target = workingConflictModal.targetDeal;
                  handleToggleWorkActivity(target, true);
                }}
                className="btn-ghost-neon px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-sky-400 hover:text-white bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/40 cursor-pointer text-center transition-all"
              >
                Iniciar a Nova
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhamento Completo das Métricas das Colunas */}
      {isMetricsModalOpen && (
        <div
          onClick={() => setIsMetricsModalOpen(false)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in select-none"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-2xl border border-sky-400/30 bg-slate-950 p-5 sm:p-6 shadow-2xl flex flex-col text-white space-y-4 shadow-sky-950/40 max-h-[90vh] overflow-hidden"
          >
            {/* Header do Modal de Métricas */}
            <div className="shrink-0 flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/40 shrink-0">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-sky-300">
                    Métricas de Permanência por Etapa Comercial
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Cálculo médio de dias em cada coluna (exclui tarefas internas e tarefas vinculadas).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMetricsModalOpen(false)}
                className="btn-ghost-neon p-1.5 rounded-lg text-muted-foreground hover:text-white cursor-pointer"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo com Scroll */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
              {/* 4 Cards de Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 1. Orçamentos */}
                <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/30 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 block">
                    Orçamentos
                  </span>
                  <p className="text-xl font-black font-mono text-white">
                    {pipelineMetrics.qualification.avgDays}{" "}
                    <span className="text-xs font-normal text-slate-300">
                      {pipelineMetrics.qualification.avgDays === 1 ? "dia" : "dias"}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {pipelineMetrics.qualification.count} {pipelineMetrics.qualification.count === 1 ? "orçamento" : "orçamentos"}
                  </p>
                </div>

                {/* 2. Negociações */}
                <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 block">
                    Negociações
                  </span>
                  <p className="text-xl font-black font-mono text-white">
                    {pipelineMetrics.negotiation.avgDays}{" "}
                    <span className="text-xs font-normal text-slate-300">
                      {pipelineMetrics.negotiation.avgDays === 1 ? "dia" : "dias"}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {pipelineMetrics.negotiation.count} {pipelineMetrics.negotiation.count === 1 ? "orçamento" : "orçamentos"}
                  </p>
                </div>

                {/* 3. Contratos */}
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                    Contratos
                  </span>
                  <p className="text-xl font-black font-mono text-white">
                    {pipelineMetrics.won.avgDays}{" "}
                    <span className="text-xs font-normal text-slate-300">
                      {pipelineMetrics.won.avgDays === 1 ? "dia" : "dias"}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {pipelineMetrics.won.count} {pipelineMetrics.won.count === 1 ? "ganho" : "ganhos"}
                  </p>
                </div>

                {/* 4. Perdidos */}
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block">
                    Perdidos
                  </span>
                  <p className="text-xl font-black font-mono text-white">
                    {pipelineMetrics.lost.avgDays}{" "}
                    <span className="text-xs font-normal text-slate-300">
                      {pipelineMetrics.lost.avgDays === 1 ? "dia" : "dias"}
                    </span>
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {pipelineMetrics.lost.count} {pipelineMetrics.lost.count === 1 ? "perdido" : "perdidos"}
                  </p>
                </div>
              </div>

              {/* Tabela / Listagem Detalhada por Etapa */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-sky-400" />
                  Orçamentos Ativos Considerados no Cálculo ({pipelineMetrics.totalCommercial})
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { title: "ORÇAMENTOS", list: pipelineMetrics.qualification.deals, color: "text-sky-400", border: "border-sky-500/20" },
                    { title: "NEGOCIAÇÕES", list: pipelineMetrics.negotiation.deals, color: "text-indigo-400", border: "border-indigo-500/20" },
                    { title: "CONTRATOS", list: pipelineMetrics.won.deals, color: "text-emerald-400", border: "border-emerald-500/20" },
                    { title: "PERDIDOS", list: pipelineMetrics.lost.deals, color: "text-rose-400", border: "border-rose-500/20" },
                  ].map((stageBlock, idx) => (
                    <div key={idx} className={`p-3 rounded-xl bg-black/40 border ${stageBlock.border} space-y-2`}>
                      <div className="flex items-center justify-between pb-1 border-b border-white/5">
                        <span className={`text-[11px] font-black uppercase tracking-wider ${stageBlock.color}`}>
                          {stageBlock.title} ({stageBlock.list.length})
                        </span>
                      </div>
                      {stageBlock.list.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground italic py-2 text-center">Nenhum orçamento nesta etapa.</p>
                      ) : (
                        <div className="space-y-1 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                          {stageBlock.list.map((deal) => {
                            const days = getEffectiveCalendarDays(deal.created_at);
                            return (
                              <div
                                key={deal.id}
                                onClick={() => {
                                  setIsMetricsModalOpen(false);
                                  openDealHistory(deal);
                                }}
                                className="p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                              >
                                <div className="min-w-0">
                                  <p className="text-[11px] font-bold text-white uppercase truncate">
                                    {getCleanDealTitle(deal.title)}
                                  </p>
                                  <p className="text-[9px] text-muted-foreground font-mono">
                                    Nº {getDealReqNumber(deal, deals)} • {deal.assigned_user_name || "Sem resp."}
                                  </p>
                                </div>
                                <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 border border-sky-400/30 shrink-0">
                                  {days} {days === 1 ? "dia" : "dias"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 flex items-center justify-between pt-3 border-t border-white/10">
              <span className="text-[11px] text-muted-foreground font-mono">
                Total de Orçamentos: {pipelineMetrics.totalCommercial}
              </span>
              <button
                type="button"
                onClick={() => setIsMetricsModalOpen(false)}
                className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white border border-white/20 hover:bg-white/10 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Caixa de Entrada Unificada (Inbox: Notificações + Menções) */}
      <InboxModal
        isOpen={isMentionsInboxOpen}
        onClose={() => setIsMentionsInboxOpen(false)}
        currentUser={user}
        deals={deals}
        onOpenDeal={(deal) => {
          setIsMentionsInboxOpen(false);
          const fullDeal = deals.find((d) => d.id === deal.id);
          if (fullDeal) openDealHistory(fullDeal);
        }}
        onAcceptCompletion={async (deal, notifId) => {
          const fullDeal = deals.find((d) => d.id === deal.id);
          if (fullDeal) {
            await handleAcceptCompletion(fullDeal, notifId);
          }
        }}
      />

      {/* Modal 1: Aviso Único ao Logar Fora do Expediente */}
      {showOffHoursPrompt && offHoursInfo && (
        <div
          onClick={handleDismissOffHoursPrompt}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 cursor-pointer animate-in fade-in select-none"
        >
          <div
            onClick={handleDismissOffHoursPrompt}
            className={`glass max-w-md w-full p-7 rounded-3xl border flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 relative overflow-hidden cursor-pointer ${
              isAdmin
                ? "border-amber-400/40 shadow-[0_0_50px_rgba(245,158,11,0.25)]"
                : "border-sky-400/40 shadow-[0_0_50px_rgba(56,189,248,0.25)]"
            }`}
          >
            <div className={`p-3.5 rounded-2xl ${isAdmin ? "bg-amber-500/20 text-amber-400 border border-amber-400/30 shadow-[0_0_20px_rgba(245,158,11,0.4)]" : "bg-sky-500/20 text-sky-400 border border-sky-400/30 shadow-[0_0_20px_rgba(56,189,248,0.4)]"}`}>
              {isAdmin ? <ShieldCheck className="h-9 w-9 text-amber-400" /> : <Clock className="h-9 w-9 text-sky-400" />}
            </div>

            <div className="space-y-3 w-full">
              <h2 className={`text-base sm:text-lg font-black uppercase tracking-wider ${isAdmin ? "text-amber-400" : "text-sky-400"}`}>
                {getGreeting()},{" "}
                <span className="text-white">
                  {getFirstName(user?.user_metadata?.display_name || user?.user_metadata?.full_name || (user?.email ? user.email.split("@")[0] : "Usuário"))}
                </span>
                !
              </h2>

              <div className="inline-block px-3 py-1 rounded-full bg-slate-950/80 border border-white/10 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                {offHoursInfo.reason}
              </div>

              {isAdmin ? (
                <div className="space-y-2 text-left w-full">
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs leading-relaxed space-y-2.5 shadow-inner">
                    <p className="font-black text-amber-300 uppercase tracking-wider text-xs flex items-center gap-1.5">
                      {interruptedActivityTitle ? (
                        <>
                          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                          Atividade Interrompida
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4 shrink-0 text-amber-400" />
                          Acesso Fora do Expediente
                        </>
                      )}
                    </p>
                    {interruptedActivityTitle && (
                      <div className="p-2.5 rounded-xl bg-black/40 border border-amber-500/20 text-[11px] font-mono text-amber-200">
                        <span className="text-muted-foreground block text-[9px] uppercase">Atividade pausada:</span>
                        <span className="font-bold text-white truncate block">{interruptedActivityTitle}</span>
                      </div>
                    )}
                    <p className="text-[12px] text-amber-100 leading-relaxed">
                      {interruptedActivityTitle ? (
                        <>
                          A sua atividade ativa foi interrompida pelo corte de horário, mas como <strong>administrador</strong> você tem permissão para iniciar novas atividades nesse horário se desejar.
                        </>
                      ) : (
                        <>
                          Você está acessando fora do horário de expediente comercial. Como <strong>administrador</strong>, você tem permissão liberada para navegar e iniciar atividades se desejar.
                        </>
                      )}
                    </p>
                  </div>
                  <p className="text-[10px] text-center text-muted-foreground/70 uppercase tracking-wider font-bold pt-1">
                    Clique em qualquer lugar para prosseguir
                  </p>
                </div>
              ) : (
                <>
                  {interruptedActivityTitle && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] font-mono text-amber-200 text-left w-full">
                      <span className="text-muted-foreground block text-[9px] uppercase">Atividade pausada:</span>
                      <span className="font-bold text-white truncate block">{interruptedActivityTitle}</span>
                    </div>
                  )}
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-semibold">
                    Você pode apenas navegar, consultar e acompanhar tarefas.
                  </p>
                  <button
                    onClick={handleDismissOffHoursPrompt}
                    className="w-full py-2.5 px-4 rounded-xl font-black uppercase tracking-wider text-xs shadow-lg transition-all cursor-pointer bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20 mt-2"
                  >
                    Entendido
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Alerta de Inatividade Durante o Expediente (Apenas em horário de trabalho após 5min) */}
      {showChooseActivityPrompt && (
        <div
          onClick={handleDismissActivityPrompt}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md p-4 cursor-pointer animate-in fade-in select-none"
        >
          <div
            onClick={handleDismissActivityPrompt}
            className="glass max-w-md w-full p-8 rounded-3xl border border-sky-400/50 shadow-[0_0_50px_rgba(56,189,248,0.25)] flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 cursor-pointer relative overflow-hidden"
          >
            <div className="p-4 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-400/30 shadow-[0_0_20px_rgba(56,189,248,0.4)] animate-pulse">
              <Play className="h-10 w-10 fill-sky-400" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider text-sky-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]">
                {getGreeting()},{" "}
                <span className="text-white">
                  {getFirstName(user?.user_metadata?.display_name || user?.user_metadata?.full_name || (user?.email ? user.email.split("@")[0] : "Usuário"))}
                </span>
                !
              </h2>

              <p className="text-sm sm:text-base text-sky-100 font-semibold leading-relaxed">
                Selecione uma atividade e clique em <strong className="text-white font-black">INICIAR ATIVIDADE</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edição de Cliente da Atividade pelo Administrador */}
      {isEditingCustomer && selectedDealForHistory && role === "admin" && (
        <div
          onClick={() => setIsEditingCustomer(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-lg rounded-2xl border border-sky-500/40 p-6 shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Alterar Cliente da Atividade
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Atividade Nº {getDealReqNumber(selectedDealForHistory, deals)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingCustomer(false)}
                className="btn-ghost-neon p-2 rounded-xl text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Campo de Busca Rápida de Clientes */}
            <div className="shrink-0 space-y-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Pesquisar cliente por nome ou razão social..."
                  value={editingCustomerSearch}
                  onChange={(e) => setEditingCustomerSearch(e.target.value)}
                  className="input-futuristic w-full rounded-xl pl-9 pr-3 py-2 text-xs outline-none bg-slate-900/90 border border-white/10 text-white"
                  autoFocus
                />
              </div>
            </div>

            {/* Lista de Opções de Clientes */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {/* Opção 1: Uso Interno / Sem Cliente Externo */}
              <button
                type="button"
                disabled={isSavingCustomer}
                onClick={() => handleSaveCustomer(null)}
                className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                  !selectedDealForHistory.customer_id
                    ? "bg-sky-500/20 border-sky-400 text-sky-200 shadow-sm"
                    : "bg-white/[0.02] border-white/5 text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="space-y-0.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-white">
                    Uso Interno / Empresa
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Atividade sem vínculo com cliente externo específico
                  </p>
                </div>
                {!selectedDealForHistory.customer_id && (
                  <Check className="h-4 w-4 text-sky-400 shrink-0" />
                )}
              </button>

              {/* Lista de Clientes Filtrados */}
              {customers
                .filter((c) => {
                  const term = editingCustomerSearch.trim().toLowerCase();
                  if (!term) return true;
                  return (
                    (c.company_name && c.company_name.toLowerCase().includes(term)) ||
                    (c.name && c.name.toLowerCase().includes(term)) ||
                    (c.document && c.document.toLowerCase().includes(term))
                  );
                })
                .map((cust) => {
                  const displayName = (cust.company_name || cust.name || "Cliente").toUpperCase();
                  const isCurrent = selectedDealForHistory.customer_id === cust.id;

                  return (
                    <button
                      key={cust.id}
                      type="button"
                      disabled={isSavingCustomer}
                      onClick={() => handleSaveCustomer(cust.id)}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        isCurrent
                          ? "bg-sky-500/25 border-sky-400 text-sky-200 shadow-md"
                          : "bg-white/[0.02] border-white/5 text-slate-200 hover:bg-slate-900 hover:border-sky-500/30 hover:text-white"
                      }`}
                    >
                      <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                        <p className="text-xs font-bold uppercase tracking-wider truncate text-white">
                          {displayName}
                        </p>
                        {cust.document && (
                          <p className="text-[10px] font-mono text-muted-foreground">
                            CNPJ/CPF: {cust.document}
                          </p>
                        )}
                      </div>
                      {isCurrent ? (
                        <Check className="h-4 w-4 text-sky-400 shrink-0" />
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-sky-400/80 group-hover:text-sky-300 shrink-0">
                          Selecionar →
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Rodapé Informativo */}
            <div className="shrink-0 flex items-center justify-between pt-3 border-t border-white/10">
              <span className="text-xs text-muted-foreground font-mono">
                {customers.length} clientes disponíveis
              </span>
              <button
                type="button"
                onClick={() => setIsEditingCustomer(false)}
                className="btn-ghost-neon px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <ProfileDialog
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={user}
      />

      {/* Modal Futurista de Confirmação do CRM */}
      {crmConfirmConfig && (
        <ConfirmModal
          isOpen={crmConfirmConfig.isOpen}
          onClose={() => setCrmConfirmConfig(null)}
          onConfirm={crmConfirmConfig.onConfirm}
          title={crmConfirmConfig.title}
          description={crmConfirmConfig.description}
          confirmText={crmConfirmConfig.confirmText}
          cancelText={crmConfirmConfig.cancelText}
          variant={crmConfirmConfig.variant || "danger"}
          requireKeyword={crmConfirmConfig.requireKeyword}
          isLoading={isDeletingDeal}
        />
      )}
    </div>
  </TooltipProvider>
  );
}
