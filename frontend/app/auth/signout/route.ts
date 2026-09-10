import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient(await cookies());
  const { data: claimsData } = await supabase.auth.getClaims();

  if (claimsData?.claims) {
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  return NextResponse.redirect(new URL("/login", request.url), { status: 302 });
}
