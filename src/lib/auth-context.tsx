import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "user" | "pending" | null;

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  fetchRole: (uid: string) => Promise<void>;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

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
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .maybeSingle();

      // Se não tiver role, assumimos que é 'pending' para os novos
      setRole((data?.role as Role) ?? "pending");
    } catch (err) {
      console.error("Auth: Falha ao buscar cargo:", err);
      setRole("pending");
    } finally {
      setLoading(false);
    }
  }

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    setLoading(true); // Garante que mostre carregando ao trocar de usuário
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
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
      value={{ user, session, role, loading, signIn, signUp, signOut, fetchRole }}
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
