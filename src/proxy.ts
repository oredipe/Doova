import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before each page: refreshes the Supabase session cookie and keeps signed-out
// people out of the app pages. (Next.js 16 calls this file "proxy"; it used to be "middleware".)

const APP_PATHS = ["/tasks", "/my-tasks", "/wallet", "/settings", "/create"];
const AUTH_PATHS = ["/sign-in", "/sign-up"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response; // not configured yet: pages show a setup message

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not put code between createServerClient and getUser: it refreshes the session.
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!data.user && APP_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    const to = request.nextUrl.clone();
    to.pathname = "/sign-in";
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }
  if (data.user && AUTH_PATHS.includes(path) && data.user.user_metadata?.profile_complete) {
    const to = request.nextUrl.clone();
    to.pathname = "/tasks";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)"],
};
