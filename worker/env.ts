export type Bindings = Omit<Env, "SUPABASE_URL" | "SUPABASE_ANON_KEY"> & {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MEDIA_SIGNING_KEY: string;
  DEMO_PASSWORD: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { userId: string; token: string };
};
