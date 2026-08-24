import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  getClientPublicIp,
  fetchAllowedIps,
  registerUnauthorizedAccessAttempt,
} from "@/lib/network-security";
import { recordLoginAudit } from "@/lib/work-time-tracker";

export type Role = "admin" | "user" | "financeiro" | "crm_vendedor" | "crm_gestor" | "pending" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  loading: boolean;
  clientIp: string;
  allowedIps: string[];
  isNetworkAllowed: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  fetchRole: (uid: string) => Promise<void>;
  refreshNetworkSecurity: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [clientIp, setClientIp] = useState<string>("0.0.0.0");
  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [isNetworkAllowed, setIsNetworkAllowed] = useState<boolean>(true);

  async function checkNetwork(currentUser?: User | null, currentRole?: Role) {
    try {
      const [ip, ips] = await Promise.all([getClientPublicIp(), fetchAllowedIps()]);
      setClientIp(ip);
      setAllowedIps(ips);

      // Admin tem acesso irrestrito
      if (currentRole === "admin" || (currentUser?.email && currentUser.email.includes("admin"))) {
        setIsNetworkAllowed(true);
        return;
      }

      // Usuário comum: verifica se o IP está na lista de autorizados
      const isAllowed = ip === "0.0.0.0" || ips.includes(ip);
      setIsNetworkAllowed(isAllowed);

      // Se for tentativa de usuário logado fora da rede, registra alerta no banco para o ADM
      if (!isAllowed && currentUser) {
        registerUnauthorizedAccessAttempt({
          userId: currentUser.id,
          userName: currentUser.user_metadata?.display_name,
          userEmail: currentUser.email,
          attemptedIp: ip,
        });
      }
    } catch (err) {
      console.warn("Erro ao validar segurança de rede:", err);
      setIsNetworkAllowed(true); // Fallback suave
    }
  }

  const refreshNetworkSecurity = async () => {
    await checkNetwork(user, role);
  };

  useEffect(() => {
    checkNetwork(user, role);
  }, [user, role]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        fetchRole(sess.user.id);
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchRole(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(uid: string) {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);

      if (error) throw error;

      let userRole: Role = "user";
      if (data && data.length > 0) {
        const roles = data.map((r) => r.role as Role);
        if (roles.includes("admin")) {
          userRole = "admin";
        } else if (roles.includes("financeiro")) {
          userRole = "financeiro";
        } else if (roles.includes("crm_gestor")) {
          userRole = "crm_gestor";
        } else if (roles.includes("crm_vendedor")) {
          userRole = "crm_vendedor";
        } else if (roles.includes("user")) {
          userRole = "user";
        } else {
          userRole = (roles[0] as Role) || "user";
        }
      }
      setRole(userRole);
      checkNetwork(user, userRole);
    } catch (err) {
      console.error("Auth: Falha ao buscar cargo:", err);
      setRole("user");
    } finally {
      setLoading(false);
    }
  }

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    setLoading(true);
    const ip = await getClientPublicIp();
    const ips = await fetchAllowedIps();
    setClientIp(ip);
    setAllowedIps(ips);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    // Verifica cargo do usuário que acabou de logar
    let loggedRole: Role = "user";
    if (data.user) {
      const { data: rData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (rData && rData.length > 0) {
        const roles = rData.map((r) => r.role as Role);
        if (roles.includes("admin")) loggedRole = "admin";
        else if (roles.includes("financeiro")) loggedRole = "financeiro";
        else loggedRole = "user";
      }
    }

    // Se não for admin e tentar entrar fora da rede da empresa:
    const isAllowed = loggedRole === "admin" || ip === "0.0.0.0" || ips.includes(ip);
    if (!isAllowed) {
      setIsNetworkAllowed(false);
      // Registra a tentativa de acesso para alertar o ADM
      await registerUnauthorizedAccessAttempt({
        userId: data.user?.id,
        userName: data.user?.user_metadata?.display_name,
        userEmail: email,
        attemptedIp: ip,
      });
      await supabase.auth.signOut();
      return {
        error: `ACESSO BLOQUEADO: Conexão detectada fora da rede da empresa (IP: ${ip}). Tentativa registrada e enviada para o Administrador.`,
      };
    }

    setIsNetworkAllowed(true);
    if (data.user) {
      recordLoginAudit(data.user);
    }
    return { error: null };
  };

  const signUp: AuthCtx["signUp"] = async (email, password, displayName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        loading,
        clientIp,
        allowedIps,
        isNetworkAllowed,
        signIn,
        signUp,
        signOut,
        fetchRole,
        refreshNetworkSecurity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
