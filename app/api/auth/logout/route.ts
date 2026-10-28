import { NextResponse } from "next/server";

import { LOGIN_METHOD_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(LOGIN_METHOD_COOKIE);
  return response;
}
