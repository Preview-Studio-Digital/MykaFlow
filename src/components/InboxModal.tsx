import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { 
  ChevronLeft, 
  AtSign, 
  Search, 
  Inbox, 
  MessageSquare, 
  ExternalLink,
  Bell,
  CheckCircle2,
  CheckCheck,
  Clock,
  Send,
  User,
  UserCheck
} from "lucide-react";
import { toast } from "sonner";

function formatElapsedLive(startedAt: string, currentMs: number = Date.now()): string {
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) return "00m 00s";
  const sec = Math.max(0, Math.floor((currentMs - startMs) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mFormatted = String(m).padStart(2, "0");
  const sFormatted = String(s).padStart(2, "0");
  if (h > 0) return `${h}h ${mFormatted}m ${sFormatted}s`;
  return `${mFormatted}m ${sFormatted}s`;
}

function LiveElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() => formatElapsedLive(startedAt));

  useEffect(() => {
    setElapsed(formatElapsedLive(startedAt));
    const timer = setInterval(() => {
      setElapsed(formatElapsedLive(startedAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return <>{elapsed}</>;
}

export interface TaskCompletionNotification {
  id: string;
  deal_id: string;
  deal_title: string;
  req_number: string;
  author_id: string;
  author_name: string;
  concluded_by_user_id: string;
  concluded_by_user_name: string;
  completion_notes: string;
  created_at: string;
  status: "pending_acceptance" | "accepted";
  accepted_at?: string | null;
  accepted_by_user_id?: string | null;
  accepted_by_user_name?: string | null;
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

export interface MentionDeal {
  id: string;
  title: string;
  stage: string;
  notes?: string | null;
  req_number?: string | null;
  customer_name?: string | null;
  customer_id?: string | null;
  created_at?: string;
  user_id?: string | null;
  assigned_user_id?: string | null;
}

export function getDealCompletionNotifications(deal: { notes?: string | null } | null): TaskCompletionNotification[] {
  if (!deal || !deal.notes) return [];
  const notifs: TaskCompletionNotification[] = [];
  try {
    const regex = /\[TASK_COMPLETION_NOTIFICATION:(.*?)\]/g;
    let match;
    while ((match = regex.exec(deal.notes)) !== null) {
      if (match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed && parsed.id && (parsed.author_id || parsed.authorId)) {
            notifs.push({
              id: parsed.id,
              deal_id: parsed.deal_id || parsed.dealId || "",
              deal_title: parsed.deal_title || parsed.dealTitle || "",
              req_number: parsed.req_number || parsed.reqNumber || "",
              author_id: parsed.author_id || parsed.authorId || "",
              author_name: parsed.author_name || parsed.authorName || "Autor",
              concluded_by_user_id: parsed.concluded_by_user_id || parsed.concludedByUserId || "",
              concluded_by_user_name: parsed.concluded_by_user_name || parsed.concludedByUserName || "Responsável",
              completion_notes: parsed.completion_notes || parsed.completionNotes || "",
              created_at: parsed.created_at || parsed.createdAt || new Date().toISOString(),
              status: parsed.status || "pending_acceptance",
              accepted_at: parsed.accepted_at || parsed.acceptedAt || null,
              accepted_by_user_id: parsed.accepted_by_user_id || parsed.acceptedByUserId || null,
              accepted_by_user_name: parsed.accepted_by_user_name || parsed.acceptedByUserName || null,
            });
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn("Erro ao fazer parse de notificações:", e);
  }
  return notifs;
}

export function isDealPendingAuthorAcceptance(deal: { notes?: string | null } | null): boolean {
  if (!deal || !deal.notes) return false;
  const notifs = getDealCompletionNotifications(deal);
  return notifs.some((n) => n.status === "pending_acceptance");
}

export function getDealMentions(deal: MentionDeal | null): DealMention[] {
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
  } catch (e) {
    console.warn("Erro ao fazer parse de menções em deal:", deal.id, e);
  }
  return mentions;
}

export function getDealMentionReplies(deal: MentionDeal | null): DealMentionReply[] {
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
  } catch (e) {
    console.warn("Erro ao fazer parse de respostas de menções em deal:", deal.id, e);
  }
  return replies;
}

export function getDealReqNumber(deal: MentionDeal, allDeals?: MentionDeal[]): string {
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
    .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  const index = sameMonthDeals.findIndex((other) => other.id === deal.id);
  const seq = index >= 0 ? index + 1 : sameMonthDeals.length + 1;
  return `${prefix}.${String(seq).padStart(2, "0")}`;
}

export function getCleanDealTitle(title: string): string {
  return (title || "")
    .replace(/^\[.*?\]\s*/, "")
    .replace(/\s*-\s*REQUISITO\s*#?[0-9.]+/i, "")
    .trim();
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getMentionTextForUser(
  userNameOrId: string | undefined | null,
  teamMembersList: Array<{ id: string; display_name?: string | null; email?: string }> = []
): string {
  if (!userNameOrId) return "";
  const cleanSearch = userNameOrId.replace(/^@/, "").trim().toLowerCase();
  if (!cleanSearch) return "";

  let member = teamMembersList.find((m) => m.id === userNameOrId);
  if (!member) {
    member = teamMembersList.find((m) => {
      const name = (m.display_name || "").trim().toLowerCase();
      const email = (m.email || "").trim().toLowerCase();
      const first = name.split(" ")[0];
      return name === cleanSearch || email === cleanSearch || first === cleanSearch;
    });
  }

  if (member) {
    const name = member.display_name || member.email || "";
    const firstName = name.split(" ")[0];
    return `@${firstName} `;
  }

  const firstName = cleanSearch.split(" ")[0];
  return `@${firstName} `;
}

interface InboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  deals?: MentionDeal[];
  teamMembers?: Array<{ id: string; display_name?: string | null; email?: string }>;
  onOpenDeal?: (deal: MentionDeal) => void;
  onAcceptCompletion?: (deal: MentionDeal, notificationId?: string) => Promise<void> | void;
  onMarkMentionAsRead?: (deal: MentionDeal, mentionId: string) => Promise<void> | void;
}

export function InboxModal({
  isOpen,
  onClose,
  currentUser,
  deals: propDeals,
  teamMembers: propTeamMembers,
  onOpenDeal,
  onAcceptCompletion,
  onMarkMentionAsRead,
}: InboxModalProps) {
  const navigate = useNavigate();
  const [internalDeals, setInternalDeals] = useState<MentionDeal[]>([]);
  const [internalTeamMembers, setInternalTeamMembers] = useState<Array<{ id: string; display_name?: string | null; email?: string }>>([]);
  const teamMembers = propTeamMembers && propTeamMembers.length > 0 ? propTeamMembers : internalTeamMembers;
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [notifFilterTab, setNotifFilterTab] = useState<"all" | "pending" | "accepted">("pending");
  const [mentionsFilterTab, setMentionsFilterTab] = useState<"all" | "unread" | "read">("unread");
  
  // Respostas rápidas para menções
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyingToMentionId, setReplyingToMentionId] = useState<string | null>(null);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [acceptingNotifId, setAcceptingNotifId] = useState<string | null>(null);

  const deals = propDeals && propDeals.length > 0 ? propDeals : internalDeals;

  const fetchDeals = async () => {
    const { data } = await supabase
      .from("crm_deals")
      .select("id, title, stage, notes, req_number, created_at, user_id, assigned_user_id");
    if (data) {
      setInternalDeals(data as MentionDeal[]);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!propDeals || propDeals.length === 0) {
      fetchDeals();
    }
    if (!propTeamMembers || propTeamMembers.length === 0) {
      supabase.from("profiles").select("id, display_name, email").then(({ data }) => {
        if (data) setInternalTeamMembers(data);
      });
    }
  }, [isOpen, propDeals, propTeamMembers]);

  // Atividade em andamento do usuário logado (Trabalhando Ao Vivo)
  const activeDeal = useMemo(() => {
    return (deals || []).find((d) => {
      if (!d || !d.notes || !d.notes.includes("[WORK_ACTIVE:")) return false;
      try {
        const match = d.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
        if (match && match[1]) {
          const parsed = JSON.parse(match[1]);
          return parsed.userId === currentUser?.id;
        }
      } catch (e) {}
      return false;
    }) || null;
  }, [deals, currentUser]);

  const activeWorkerInfo = useMemo(() => {
    if (!activeDeal?.notes) return null;
    try {
      const match = activeDeal.notes.match(/\[WORK_ACTIVE:(.*?)\]/);
      if (match && match[1]) {
        return JSON.parse(match[1]) as { userId: string; userName: string; startedAt: string };
      }
    } catch (e) {}
    return null;
  }, [activeDeal]);

  // 1. Notificações destinadas ao usuário logado (onde ele é o autor)
  const userNotificationsData = useMemo(() => {
    if (!currentUser) return { all: [], pendingCount: 0 };
    const myId = currentUser.id;
    const allNotifs: Array<{ notification: TaskCompletionNotification; deal: MentionDeal }> = [];

    deals.forEach((deal) => {
      const notifs = getDealCompletionNotifications(deal);
      notifs.forEach((n) => {
        // Se a notificação for direcionada ao usuário como autor (ou se for o criador do deal)
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
  }, [deals, currentUser]);

  // 2. Menções destinadas ao usuário logado
  const userMentionsData = useMemo(() => {
    if (!currentUser) return { all: [], unreadCount: 0 };
    const myId = currentUser.id;
    const allMentions: Array<{ mention: DealMention; deal: MentionDeal; replies: DealMentionReply[] }> = [];

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
  }, [deals, currentUser]);

  const handleSelectDeal = (deal: MentionDeal) => {
    onClose();
    if (onOpenDeal) {
      onOpenDeal(deal);
    } else {
      sessionStorage.setItem("mykaflow_open_deal_id", deal.id);
      navigate({ to: "/crm", search: { dealId: deal.id } as any });
    }
  };

  // Aceitar Armazenamento de Tarefa / Notificação
  const handleDirectAcceptCompletion = async (deal: MentionDeal, notification: TaskCompletionNotification) => {
    setAcceptingNotifId(notification.id);
    try {
      if (onAcceptCompletion) {
        await onAcceptCompletion(deal, notification.id);
      } else {
        const notifs = getDealCompletionNotifications(deal);
        const nowIso = new Date().toISOString();
        const userName = currentUser?.user_metadata?.display_name || currentUser?.email || "Autor";

        const updatedNotifs = notifs.map((n) =>
          n.id === notification.id
            ? {
                ...n,
                status: "accepted" as const,
                accepted_at: nowIso,
                accepted_by_user_id: currentUser?.id,
                accepted_by_user_name: userName,
              }
            : n
        );

        let cleanNotes = (deal.notes || "")
          .replace(/\[TASK_COMPLETION_NOTIFICATION:.*?\]\s*/g, "")
          .trim();
        const notifTags = updatedNotifs.map((n) => `[TASK_COMPLETION_NOTIFICATION:${JSON.stringify(n)}]`).join("\n");
        const originStage = deal.stage === "archived" ? "lead" : deal.stage;
        const originTag = (deal.notes || "").includes("<!-- ORIGIN_STAGE:") ? "" : `<!-- ORIGIN_STAGE:${originStage} -->\n`;
        const autoLog = `${userName} aceitou o armazenamento da atividade. Atividade arquivada e armazenada com sucesso.`;
        const finalNotes = `${originTag}${notifTags}\n${cleanNotes}\n\n${autoLog}`.trim();

        const { error } = await supabase
          .from("crm_deals")
          .update({
            stage: "archived",
            notes: finalNotes,
            updated_at: nowIso,
          })
          .eq("id", deal.id);

        if (error) throw error;

        try {
          await supabase.from("crm_deal_history").insert({
            deal_id: deal.id,
            user_id: currentUser?.id,
            user_name: userName,
            action_type: "completion_accepted",
            description: `Armazenamento aceito por ${userName}. Atividade arquivada e armazenada.`,
          });
        } catch (hErr) {}

        toast.success("Armazenamento aceito com sucesso! A atividade foi arquivada.");
        await fetchDeals();
      }
    } catch (err: any) {
      toast.error("Erro ao aceitar armazenamento: " + (err.message || "Tente novamente"));
    } finally {
      setAcceptingNotifId(null);
    }
  };

  // Marcar menção como lida
  const handleMarkMentionAsRead = async (deal: MentionDeal, mentionId: string) => {
    if (!currentUser) return;

    if (onMarkMentionAsRead) {
      await onMarkMentionAsRead(deal, mentionId);
      return;
    }

    const mentions = getDealMentions(deal);
    const targetMention = mentions.find((m) => m.id === mentionId);

    // Regra estrita: Somente o próprio destinatário pode marcar como lida
    if (targetMention && targetMention.mentioned_user_id !== currentUser.id) {
      toast.error("Somente o destinatário da menção pode marcá-la como lida.");
      return;
    }

    if (targetMention?.read_by_user) return;

    const updatedMentions = mentions.map((m) =>
      m.id === mentionId ? { ...m, read_by_user: true } : m
    );

    let cleanNotes = (deal.notes || "").replace(/\[MENTION:[\s\S]*?\]\s*/g, "").trim();
    const newTags = updatedMentions.map((m) => `[MENTION:${JSON.stringify(m)}]`).join("\n");
    const updatedNotes = newTags ? `${newTags}\n${cleanNotes}`.trim() : cleanNotes;

    try {
      const { error } = await supabase.from("crm_deals").update({ notes: updatedNotes }).eq("id", deal.id);
      if (error) throw error;

      setInternalDeals((prev) =>
        prev.map((d) => (d.id === deal.id ? { ...d, notes: updatedNotes } : d))
      );
      toast.success("Menção marcada como lida!");
    } catch (e: any) {
      toast.error("Erro ao marcar como lida: " + (e?.message || "Tente novamente"));
    }
  };

  // Enviar resposta rápida à menção
  const handleSendMentionReply = async (deal: MentionDeal, mention: DealMention) => {
    const text = replyText[mention.id]?.trim();
    if (!text || !currentUser) return;

    setIsSendingReply(true);
    const userName = currentUser?.user_metadata?.display_name || currentUser?.email || "Usuário";
    const nowIso = new Date().toISOString();

    const newReply: DealMentionReply = {
      id: crypto.randomUUID(),
      mention_id: mention.id,
      deal_id: deal.id,
      user_id: currentUser.id,
      user_name: userName,
      reply_text: text,
      created_at: nowIso,
    };

    // Detecta menções no texto para notificar os membros citados (inclusive o autor da menção)
    const mentionTags: string[] = [];
    teamMembers.forEach((member) => {
      const memberName = member.display_name || member.email || "";
      const firstName = memberName.split(" ")[0];
      const nameEscaped = escapeRegExp(memberName);
      const firstEscaped = escapeRegExp(firstName);
      const emailEscaped = escapeRegExp(member.email || "");
      const mentionRegex = new RegExp(`@(${nameEscaped}|${firstEscaped}|${emailEscaped})(?:$|[^A-Za-z0-9À-ÿ_])`, "i");
      if (mentionRegex.test(text)) {
        const mentionObj: DealMention = {
          id: crypto.randomUUID(),
          deal_id: deal.id,
          author_id: currentUser.id,
          author_name: userName,
          mentioned_user_id: member.id,
          mentioned_user_name: memberName,
          content: text,
          created_at: nowIso,
          read_by_user: false,
        };
        mentionTags.push(`[MENTION:${JSON.stringify(mentionObj)}]`);
      }
    });

    const replyTag = `[MENTION_REPLY:${JSON.stringify(newReply)}]`;
    const tagsBlock = mentionTags.length > 0 ? mentionTags.join("\n") + "\n" : "";
    const updatedNotes = `${replyTag}\n${tagsBlock}${deal.notes || ""}`.trim();
    const historyDesc = `↩ Resposta à atualização:\n${text}`;

    try {
      await supabase.from("crm_deals").update({ notes: updatedNotes, updated_at: nowIso }).eq("id", deal.id);
      try {
        await supabase.from("crm_deal_history").insert({
          id: newReply.id,
          deal_id: deal.id,
          user_id: currentUser.id,
          user_name: userName,
          action_type: "reply",
          description: historyDesc,
          created_at: nowIso,
        });
      } catch (hErr) {}

      // Marca como lida ao responder
      await handleMarkMentionAsRead(deal, mention.id);

      setReplyText((prev) => ({ ...prev, [mention.id]: "" }));
      setReplyingToMentionId(null);
      toast.success("Resposta enviada com sucesso!");
      await fetchDeals();
    } catch (e: any) {
      toast.error("Erro ao enviar resposta: " + e.message);
    } finally {
      setIsSendingReply(false);
    }
  };

  if (!isOpen) return null;

  // Filtragem de Notificações
  const filteredNotifications = userNotificationsData.all.filter((item) => {
    if (notifFilterTab === "pending" && item.notification.status !== "pending_acceptance") return false;
    if (notifFilterTab === "accepted" && item.notification.status !== "accepted") return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchConcludedBy = item.notification.concluded_by_user_name?.toLowerCase().includes(term);
      const matchTitle = item.deal.title?.toLowerCase().includes(term);
      const matchNotes = item.notification.completion_notes?.toLowerCase().includes(term);
      const matchReq = getDealReqNumber(item.deal, deals)?.toLowerCase().includes(term);
      if (!matchConcludedBy && !matchTitle && !matchNotes && !matchReq) return false;
    }
    return true;
  });

  // Filtragem de Menções
  const filteredMentions = userMentionsData.all.filter((item) => {
    if (mentionsFilterTab === "unread" && item.mention.read_by_user) return false;
    if (mentionsFilterTab === "read" && !item.mention.read_by_user) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchAuthor = item.mention.author_name?.toLowerCase().includes(term);
      const matchTitle = item.deal.title?.toLowerCase().includes(term);
      const matchContent = item.mention.content?.toLowerCase().includes(term);
      const matchReq = getDealReqNumber(item.deal, deals)?.toLowerCase().includes(term);
      if (!matchAuthor && !matchTitle && !matchContent && !matchReq) return false;
    }
    return true;
  });

  const totalUnreadCount = userNotificationsData.pendingCount + userMentionsData.unreadCount;

  return (
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#020617] text-white animate-in fade-in select-none">
      {/* 1. Cabeçalho Superior da Página */}
      <header className="shrink-0 bg-slate-950/90 backdrop-blur-xl border-b border-sky-500/20 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost-neon h-9 w-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-white border-white/10 shrink-0 cursor-pointer transition-all hover:scale-105"
            title="Voltar"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Título SVG com a mesma fonte e estilo das outras páginas */}
          <div className="flex flex-col select-none justify-center focus:outline-none shrink-0">
            <svg
              className="w-[85px] sm:w-[95px] h-[26px] overflow-visible select-none drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]"
              viewBox="0 0 95 26"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <text
                x="0"
                y="21"
                className="font-saira-stencil"
                fontSize="22"
                fill="#22d3ee"
                textLength="95"
                lengthAdjust="spacing"
              >
                INBOX
              </text>
            </svg>
          </div>

          <div className="h-6 w-px bg-white/15 hidden md:block shrink-0" />

          {/* Usuário e Status de Atividade em Tempo Real */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Ícone de Usuário com status online/ativo */}
            <div
              className={`relative h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 transition-all shadow-md ${
                activeWorkerInfo
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                  : "bg-slate-900 border-white/10 text-slate-400"
              }`}
            >
              {activeWorkerInfo ? (
                <UserCheck className="h-4.5 w-4.5 text-emerald-400" />
              ) : (
                <User className="h-4.5 w-4.5 text-slate-400" />
              )}

              {/* Ponto indicador de atividade em tempo real */}
              {activeWorkerInfo && (
                <>
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 animate-ping" />
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                </>
              )}
            </div>

            {/* Nome do Usuário e Pill de Atividade / Inatividade */}
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-white truncate leading-none">
                  {currentUser?.user_metadata?.display_name || currentUser?.email?.split("@")[0] || "Usuário"}
                </span>
                {totalUnreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)] shrink-0">
                    {totalUnreadCount} pendências
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-1">
                {activeWorkerInfo && activeDeal ? (
                  <div
                    onClick={() => {
                      if (onOpenDeal) {
                        onOpenDeal(activeDeal);
                      }
                    }}
                    className="inline-flex items-center rounded-full border border-emerald-500/50 bg-emerald-950/80 text-emerald-300 shadow-sm text-xs font-bold cursor-pointer hover:bg-emerald-900/80 transition-colors"
                    title="Clique para abrir detalhes da atividade em andamento"
                  >
                    <div className="flex items-center gap-2 pl-2.5 pr-2 py-0.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" />
                      <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-wider truncate max-w-[180px] sm:max-w-[280px] md:max-w-[400px]">
                        ATIVO EM:{" "}
                        <span className="text-white font-black">
                          {getCleanDealTitle(activeDeal.title)}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center rounded-full border border-emerald-500/50 bg-emerald-900/80 px-2.5 py-0.5 text-[10px] sm:text-[11px] text-emerald-300 font-mono font-bold shrink-0 -my-px -mr-px">
                      <LiveElapsedTimer startedAt={activeWorkerInfo.startedAt} />
                    </div>
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
          </div>
        </div>

        {/* Barra de Pesquisa Geral */}
        <div className="relative flex-1 sm:w-80 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nº, título, responsável..."
            className="w-full bg-slate-900 border border-white/15 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-cyan-400/60 font-mono transition-all"
          />
        </div>
      </header>

      {/* 2. Conteúdo Dividido em 2 Colunas: Lado Esquerdo (Notificações) | Lado Direito (Menções) */}
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 max-w-[1700px] w-full mx-auto custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-full items-start">
          
          {/* ========================================================= */}
          {/* COLUNA ESQUERDA: NOTIFICAÇÕES (MUITO MAIS IMPORTANTES)   */}
          {/* ========================================================= */}
          <section className="flex flex-col h-full bg-slate-950/60 border border-amber-500/20 rounded-2xl p-4 sm:p-5 shadow-xl shadow-amber-950/10 space-y-4">
            {/* Header da Coluna de Notificações */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-amber-500/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-400/30 shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                      Notificações de Armazenamento
                    </h3>
                    {userNotificationsData.pendingCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black font-mono text-[10px] font-black animate-pulse">
                        {userNotificationsData.pendingCount} a aceitar
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Atividades criadas por você que foram armazenadas pelos responsáveis.
                  </p>
                </div>
              </div>

              {/* Filtros Rápidos de Notificações */}
              <div className="flex items-center gap-1 bg-slate-900 border border-white/10 p-1 rounded-xl font-mono text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setNotifFilterTab("pending")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    notifFilterTab === "pending"
                      ? "bg-amber-500 text-black shadow-sm"
                      : "text-amber-400 hover:text-amber-200"
                  }`}
                >
                  Pendentes ({userNotificationsData.pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilterTab("accepted")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    notifFilterTab === "accepted"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-400 hover:text-emerald-200"
                  }`}
                >
                  Aceitas ({userNotificationsData.all.length - userNotificationsData.pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setNotifFilterTab("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    notifFilterTab === "all"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Todas ({userNotificationsData.all.length})
                </button>
              </div>
            </div>

            {/* Lista de Notificações */}
            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <CheckCircle2 className="h-8 w-8 text-amber-400/50 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    Nenhuma notificação de armazenamento
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                    Quando um responsável atribuído armazenar uma tarefa criada por você, o aviso de aceite aparecerá aqui.
                  </p>
                </div>
              ) : (
                filteredNotifications.map(({ notification, deal }) => {
                  const isPending = notification.status === "pending_acceptance";
                  const reqNum = notification.req_number || getDealReqNumber(deal, deals);
                  const cleanTitle = (() => {
                    const notifTitle = notification.deal_title ? getCleanDealTitle(notification.deal_title) : "";
                    if (notifTitle && notifTitle.includes(" - ")) {
                      return notifTitle;
                    }
                    const custName = (deal as any)?.customer_name;
                    const baseTitle = notifTitle || getCleanDealTitle(deal.title);
                    if (custName && custName !== "Uso Interno / Empresa" && !baseTitle.startsWith(custName.toUpperCase())) {
                      return `${custName.trim().toUpperCase()} - ${baseTitle}`;
                    }
                    return baseTitle;
                  })();

                  return (
                    <div
                      key={notification.id}
                      className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col space-y-3 shadow-lg ${
                        isPending
                          ? "bg-black border-amber-500/50 shadow-amber-950/30 hover:border-amber-400"
                          : "bg-slate-900/50 border-white/10 shadow-black/40 hover:border-emerald-500/40"
                      }`}
                    >
                      {/* Topo do Card de Notificação: Nº, Status e Data */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs font-black px-2.5 py-0.5 rounded-lg border ${
                            isPending
                              ? "bg-amber-950/80 text-amber-300 border-amber-500/40"
                              : "bg-emerald-950/60 text-emerald-300 border-emerald-500/30"
                          }`}>
                            #{reqNum}
                          </span>

                          <span className={`font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                            isPending
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isPending ? "bg-amber-400" : "bg-emerald-400"}`} />
                            {isPending ? "AGUARDANDO SEU ACEITE" : "ARMAZENAMENTO ACEITO"}
                          </span>
                        </div>

                        <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(notification.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Informações da Atividade e Responsável */}
                      <div className="space-y-1">
                        <p className="text-xs text-slate-300">
                          <span className="font-bold text-amber-400 uppercase">
                            {notification.concluded_by_user_name}
                          </span>{" "}
                          armazenou a sua atividade:
                        </p>
                        <h4 className="text-sm font-black uppercase text-white tracking-wide">
                          {cleanTitle}
                        </h4>
                      </div>

                      {/* Notas de Conclusão / Comentário deixado */}
                      {notification.completion_notes && (
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs text-slate-200 italic font-sans leading-relaxed">
                          "{notification.completion_notes}"
                        </div>
                      )}

                      {/* Ações: Aceitar Conclusão e Ver Atividade */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => handleSelectDeal(deal)}
                          className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white border border-white/15 hover:border-white/40 flex items-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Ver Atividade</span>
                        </button>

                        {isPending && (
                          <button
                            type="button"
                            disabled={acceptingNotifId === notification.id}
                            onClick={() => handleDirectAcceptCompletion(deal, notification)}
                            className="px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-black bg-emerald-400 hover:bg-emerald-300 border border-emerald-300 flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.4)] hover:scale-105 cursor-pointer transition-all"
                          >
                            <CheckCheck className="h-4 w-4" />
                            <span>{acceptingNotifId === notification.id ? "Aceitando..." : "Aceitar Armazenamento"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* ========================================================= */}
          {/* COLUNA DIREITA: MENÇÕES COM @ (@USUÁRIO)                  */}
          {/* ========================================================= */}
          <section className="flex flex-col h-full bg-slate-950/60 border border-sky-500/20 rounded-2xl p-4 sm:p-5 shadow-xl shadow-sky-950/10 space-y-4">
            {/* Header da Coluna de Menções */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-sky-500/20">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30 shrink-0 shadow-[0_0_12px_rgba(56,189,248,0.2)]">
                  <AtSign className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-sky-300">
                      Menções (@)
                    </h3>
                    {userMentionsData.unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black animate-pulse">
                        {userMentionsData.unreadCount} novas
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Citações feitas por colegas nos comentários das atividades.
                  </p>
                </div>
              </div>

              {/* Filtros Rápidos de Menções */}
              <div className="flex items-center gap-1 bg-slate-900 border border-white/10 p-1 rounded-xl font-mono text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setMentionsFilterTab("unread")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    mentionsFilterTab === "unread"
                      ? "bg-rose-500 text-white shadow-sm"
                      : "text-rose-400 hover:text-rose-200"
                  }`}
                >
                  Não Lidas ({userMentionsData.unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMentionsFilterTab("read")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    mentionsFilterTab === "read"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-emerald-400 hover:text-emerald-200"
                  }`}
                >
                  Lidas ({userMentionsData.all.length - userMentionsData.unreadCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMentionsFilterTab("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    mentionsFilterTab === "all"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Todas ({userMentionsData.all.length})
                </button>
              </div>
            </div>

            {/* Lista de Menções */}
            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {filteredMentions.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                  <MessageSquare className="h-8 w-8 text-sky-400/50 mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    Nenhuma menção encontrada
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                    Quando alguém citar seu @ em uma atividade, a mensagem aparecerá aqui para fácil resposta.
                  </p>
                </div>
              ) : (
                filteredMentions.map(({ mention, deal, replies }, idx) => {
                  const isUnread = !mention.read_by_user;
                  const itemNumber = userMentionsData.all.length - idx;
                  const formattedNumber = String(itemNumber).padStart(2, "0");
                  const custName = (deal as any)?.customer_name;
                  const rawCleanTitle = getCleanDealTitle(deal.title);
                  const cleanTitle =
                    custName && custName !== "Uso Interno / Empresa" && !rawCleanTitle.startsWith(custName.toUpperCase())
                      ? `${custName.trim().toUpperCase()} - ${rawCleanTitle}`
                      : rawCleanTitle;
                  const dealReqNumber = getDealReqNumber(deal, deals);
                  const isReplying = replyingToMentionId === mention.id;

                  return (
                    <div
                      key={mention.id}
                      className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col space-y-3 shadow-lg ${
                        isUnread
                          ? "bg-rose-950/25 border-rose-500/40 shadow-rose-950/20 hover:border-rose-400"
                          : "bg-slate-900/50 border-white/10 shadow-black/40 hover:border-sky-400/40"
                      }`}
                    >
                      {/* Topo do Card de Menção */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-xs font-black px-2 py-0.5 rounded-lg border ${
                            isUnread
                              ? "bg-rose-950/80 text-rose-300 border-rose-500/40"
                              : "bg-slate-800 text-slate-300 border-white/10"
                          }`}>
                            #{formattedNumber}
                          </span>

                          <span className={`font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                            isUnread
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isUnread ? "bg-rose-400" : "bg-emerald-400"}`} />
                            {isUnread ? "NOVA" : "LIDA"}
                          </span>
                        </div>

                        <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(mention.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>

                      {/* Informações da Mensagem e Atividade */}
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-black uppercase font-mono text-sky-400">
                            @{mention.author_name}
                          </span>
                          <span className="text-muted-foreground">citou você em</span>
                          <span className="font-bold text-white uppercase truncate max-w-full">
                            #{dealReqNumber} - {cleanTitle}
                          </span>
                        </div>

                        {/* Conteúdo da Mensagem Citada */}
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10 text-xs text-slate-200 font-sans leading-relaxed">
                          "{mention.content}"
                        </div>
                      </div>

                      {/* Respostas Anteriores */}
                      {replies && replies.length > 0 && (
                        <div className="space-y-1.5 pl-3 border-l-2 border-sky-500/30">
                          {replies.map((rep) => (
                            <div key={rep.id} className="text-[11px] text-slate-300">
                              <span className="font-bold text-sky-300">{rep.user_name}:</span> {rep.reply_text}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Campo de Resposta Rápida Aberto */}
                      {isReplying && (
                        <div className="space-y-2 pt-2 border-t border-white/10 animate-in fade-in">
                          <textarea
                            value={replyText[mention.id] || ""}
                            onChange={(e) => setReplyText({ ...replyText, [mention.id]: e.target.value })}
                            placeholder={`Responder para @${mention.author_name}...`}
                            rows={2}
                            className="w-full bg-slate-900 border border-sky-400/40 rounded-xl p-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-sky-400 font-sans resize-none"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setReplyingToMentionId(null)}
                              className="px-3 py-1 rounded-lg text-xs text-muted-foreground hover:text-white"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={isSendingReply || !replyText[mention.id]?.trim()}
                              onClick={() => handleSendMentionReply(deal, mention)}
                              className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Send className="h-3 w-3" />
                              <span>Enviar Resposta</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ações da Menção */}
                      {!isReplying && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                          {isUnread && (
                            <button
                              type="button"
                              onClick={() => handleMarkMentionAsRead(deal, mention.id)}
                              className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 flex items-center gap-1 cursor-pointer"
                              title="Marcar como lida"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              <span>Marcar como Lida</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const authorMention = getMentionTextForUser(mention.author_name || mention.author_id, teamMembers);
                              setReplyText((prev) => ({
                                ...prev,
                                [mention.id]: prev[mention.id] || authorMention,
                              }));
                              setReplyingToMentionId(mention.id);
                            }}
                            className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold text-sky-400 hover:text-white border border-sky-500/30 flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>Responder</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (isUnread) handleMarkMentionAsRead(deal, mention.id);
                              handleSelectDeal(deal);
                            }}
                            className="btn-ghost-neon px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-300 hover:text-white border border-white/15 hover:border-white/40 flex items-center gap-1.5 cursor-pointer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Ver Atividade</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
