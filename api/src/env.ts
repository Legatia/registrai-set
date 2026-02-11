export type Bindings = {
  DB: D1Database;
  API_KEY: string;
  ADMIN_KEY: string;
};

export type Variables = {
  apiKey: string;
  developerId: string;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
