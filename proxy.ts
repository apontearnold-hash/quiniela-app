import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Paths that never require auth or status checks
const PUBLIC_PATHS = ["/", "/login", "/auth", "/pending", "/blocked"]
// API routes handle their own auth — don't redirect them (would break JSON responses)
const SKIP_STATUS_CHECK = ["/api/"]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )
  const isApi = SKIP_STATUS_CHECK.some((p) => pathname.startsWith(p))

  // Always refresh session (required by Supabase SSR)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Unauthenticated on a protected route → redirect to login
  if (!user) {
    if (!isPublic && !isApi) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    return supabaseResponse
  }

  // Logged-in user visiting login → send to dashboard
  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Authenticated on a protected page → enforce profile status
  if (!isPublic && !isApi) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single()

    // Only block if status is explicitly set to pending or blocked.
    // undefined/null means the column doesn't exist yet (migration not run)
    // or the profile row is missing — in both cases, let the user through.
    const status = profile?.status

    if (status === "pending") {
      return NextResponse.redirect(new URL("/pending", request.url))
    }
    if (status === "blocked") {
      return NextResponse.redirect(new URL("/blocked", request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
