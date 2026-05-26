import { createFileRoute } from "@tanstack/react-router";

const MYKACASH_URL = "https://wzxrhkjyxpphrclravfz.supabase.co";
const MYKACASH_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6eHJoa2p5eHBwaHJjbHJhdmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMTIxMjUsImV4cCI6MjA5Mjg4ODEyNX0.rowKt4jHw7ufQ_TuijiLh73AHzGe2WcrI9w-cKApmNo";

export const Route = createFileRoute("/api/public/mykacash-auth")({
  server: {
    handlers: {
      POST: async () => {
        const email = process.env.MYKACASH_EMAIL;
        const password = process.env.MYKACASH_PASSWORD;

        if (!email || !password) {
          return Response.json(
            { error: "Credenciais do MYKACASH não configuradas" },
            { status: 500 },
          );
        }

        try {
          const res = await fetch(
            `${MYKACASH_URL}/auth/v1/token?grant_type=password`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: MYKACASH_ANON_KEY,
              },
              body: JSON.stringify({ email, password }),
            },
          );

          const data = (await res.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            expires_at?: number;
            token_type?: string;
            error?: string;
            error_description?: string;
            msg?: string;
          };

          if (!res.ok || !data.access_token) {
            return Response.json(
              {
                error:
                  data.error_description ||
                  data.error ||
                  data.msg ||
                  "Falha na autenticação com MYKACASH",
              },
              { status: res.status || 401 },
            );
          }

          return Response.json({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in,
            expires_at: data.expires_at,
            token_type: data.token_type,
          });
        } catch (err) {
          console.error("[mykacash-auth] erro:", err);
          return Response.json(
            { error: "Erro ao contatar MYKACASH" },
            { status: 502 },
          );
        }
      },
    },
  },
});
