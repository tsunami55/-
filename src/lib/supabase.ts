import { createClient } from "@supabase/supabase-js";

// URL과 공개 키(anon/publishable)는 브라우저에 노출되어도 되는 값이다. 보안은 DB의 RLS와 서버 함수가 담당.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://qmbenckgbnwxjcpyqraz.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
