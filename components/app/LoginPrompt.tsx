"use client";

import { useRouter } from "next/navigation";

import { useAuth } from "@/components/ui/Providers";

/** Login call to action for logged-out visitors, or the log out button. */
export function LoginPrompt({ mode = "login" }: { mode?: "login" | "logout" }) {
  const router = useRouter();
  const { openLogin, logout } = useAuth();
  if (mode === "logout") {
    return (
      <button className="button button--ghost" type="button" onClick={logout}>
        <i className="ph ph-sign-out" />
        Log out
      </button>
    );
  }
  return (
    <button className="button button--primary button--large" type="button" onClick={() => openLogin(() => router.refresh())}>
      Log in or sign up
    </button>
  );
}
