import { NextResponse, type NextRequest } from "next/server";

import { getSessionAddress } from "@/lib/auth/session";
import { deleteGuard, GuardianInputError, updateGuard } from "@/lib/guardian/data";
import { db } from "@/lib/supabase";

type Context = { params: Promise<{ id: string }> };

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Change a guard's limits or basis ({ stopLossPct, takeProfitPct?, basisPrice? }); this also re-arms it. */
export async function PATCH(request: NextRequest, context: Context) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { id } = await context.params;
  if (!isId(id)) return NextResponse.json({ error: "Guard not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    await updateGuard(db(), owner, id, body ?? {});
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (cause instanceof GuardianInputError) return NextResponse.json({ error: cause.message }, { status: 400 });
    console.error(cause);
    return NextResponse.json({ error: "Updating the guard failed. Please try again." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const owner = await getSessionAddress();
  if (!owner) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  const { id } = await context.params;
  if (!isId(id)) return NextResponse.json({ error: "Guard not found." }, { status: 404 });
  try {
    await deleteGuard(db(), owner, id);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (cause instanceof GuardianInputError) return NextResponse.json({ error: cause.message }, { status: 404 });
    console.error(cause);
    return NextResponse.json({ error: "Removing the guard failed. Please try again." }, { status: 500 });
  }
}
