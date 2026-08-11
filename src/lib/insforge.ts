import { createClient } from "@insforge/sdk";

const url = import.meta.env.VITE_INSFORGE_URL as string | undefined;
const key = import.meta.env.VITE_INSFORGE_ANON_KEY as string | undefined;

if (!url || !key) {
  throw new Error(
    "Faltan VITE_INSFORGE_URL / VITE_INSFORGE_ANON_KEY en .env.local",
  );
}

export const insforge = createClient({ baseUrl: url, anonKey: key });
