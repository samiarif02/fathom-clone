import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

type AuthState = { session: Session | null; loading: boolean };
const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });
  useEffect(() => {
    let unsubscribe = () => {};
    getSupabase().then(async (sb) => {
      const { data } = await sb.auth.getSession();
      setState({ session: data.session, loading: false });
      const sub = sb.auth.onAuthStateChange((_e, session) => setState({ session, loading: false }));
      unsubscribe = () => sub.data.subscription.unsubscribe();
    });
    return () => unsubscribe();
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export async function signInAsDemo() {
  const res = await fetch("/api/demo-login", { method: "POST" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Demo sign-in failed");
  const { access_token, refresh_token } = await res.json();
  const sb = await getSupabase();
  const { error } = await sb.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}

export async function signOut() {
  await (await getSupabase()).auth.signOut();
}
