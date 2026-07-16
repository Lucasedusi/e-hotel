import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuthenticatedUserAccess, HotelRole } from "@/types/auth";

const SELECTED_HOTEL_COOKIE = "e_hotel_selected_hotel";

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
}

interface HotelRow {
  id: string;
  name: string;
  status: string;
}

interface MembershipRow {
  hotel_id: string;
  role: HotelRole;
  hotels: HotelRow | HotelRow[] | null;
}

function normalizeHotel(hotels: MembershipRow["hotels"]) {
  return Array.isArray(hotels) ? hotels[0] : hotels;
}

export async function getAuthenticatedProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error("Não foi possível validar o perfil do usuário.");

  return data as ProfileRow | null;
}

export async function getCurrentHotelAccess(): Promise<AuthenticatedUserAccess | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, email, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error("Não foi possível validar o perfil do usuário.");
  }

  const profile = profileData as ProfileRow | null;

  if (!profile || !profile.is_active) return null;

  const { data: membershipData, error: membershipError } = await supabase
    .from("hotel_members")
    .select("hotel_id, role, hotels!inner(id, name, status)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("hotels.status", "active");

  if (membershipError) {
    throw new Error("Não foi possível validar o acesso ao hotel.");
  }

  const memberships = (membershipData ?? []) as unknown as MembershipRow[];
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const selectedHotelId = cookieStore.get(SELECTED_HOTEL_COOKIE)?.value;
  const selectedMembership =
    memberships.find((item) => item.hotel_id === selectedHotelId) ??
    memberships[0];
  const hotel = normalizeHotel(selectedMembership.hotels);

  if (!hotel) return null;

  return {
    userId: user.id,
    name: profile.name,
    email: profile.email,
    hotelId: hotel.id,
    hotelName: hotel.name,
    role: selectedMembership.role,
  };
}

export async function requireAuthenticatedProfile() {
  const profile = await getAuthenticatedProfile();

  if (!profile) redirect("/acesso-negado");
  if (!profile.is_active) redirect("/acesso-negado?motivo=usuario-inativo");

  return profile;
}

export async function requireHotelAccess(allowedRoles?: readonly HotelRole[]) {
  const access = await getCurrentHotelAccess();

  if (!access) redirect("/onboarding");

  if (allowedRoles && !allowedRoles.includes(access.role)) {
    redirect("/acesso-negado?motivo=sem-permissao");
  }

  return access;
}
