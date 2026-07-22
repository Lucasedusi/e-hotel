"use server";

import { revalidatePath } from "next/cache";
import { requireHotelAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CHARGE_TYPES,
  CUSTOMER_TYPES,
  DOCUMENT_TYPES,
  RESERVATION_SOURCES,
  RESERVATION_TYPES,
  type AvailableRoomRow,
  type ChargeType,
  type CustomerType,
  type DocumentType,
  type ReservationActionResult,
  type ReservationGuestInput,
  type ReservationRoomInput,
  type ReservationSource,
  type ReservationType,
} from "@/types/reservations";

const OPERATION_ROLES = ["owner", "admin", "reception"] as const;
const PAYMENT_ROLES = ["owner", "admin", "reception", "finance"] as const;
const CLOSED_RESERVATIONS = ["checked_out", "cancelled", "no_show"];
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function optionalText(formData: FormData, name: string) {
  return textValue(formData, name) || null;
}

function numberValue(formData: FormData, name: string) {
  return Number(textValue(formData, name).replace(",", "."));
}

function dateIsValid(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function optionalTimestamp(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseJsonArray<T>(formData: FormData, name: string): T[] | null {
  try {
    const value = JSON.parse(textValue(formData, name));
    return Array.isArray(value) ? (value as T[]) : null;
  } catch {
    return null;
  }
}

function databaseMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("overlap") || normalized.includes("sobrepos") || normalized.includes("exclusion")) {
    return "Um dos quartos já possui reserva ou bloqueio nesse período. Atualize a disponibilidade e escolha outro quarto.";
  }
  if (normalized.includes("duplicate") || normalized.includes("unique")) {
    return "Já existe um cadastro com essa informação neste hotel.";
  }
  if (normalized.includes("capacity") || normalized.includes("capacidade")) {
    return "A quantidade de hóspedes ultrapassa a capacidade do quarto.";
  }
  if (normalized.includes("permission") || normalized.includes("policy") || normalized.includes("rls")) {
    return "Você não possui permissão para concluir esta ação.";
  }
  if (normalized.includes("attachment") || normalized.includes("comprovante")) {
    return "O comprovante é obrigatório para confirmar este pagamento.";
  }
  if (normalized.includes("closed") || normalized.includes("final") || normalized.includes("encerrad")) {
    return "Esta reserva está encerrada e não aceita novas alterações.";
  }
  if (normalized.includes("foreign key") || normalized.includes("violates")) {
    return "A ação não pôde ser concluída porque existem vínculos ou dados incompatíveis.";
  }
  return "Não foi possível concluir a ação. Confira os dados e tente novamente.";
}

function failure<T = undefined>(message: string, fieldErrors?: Record<string, string>): ReservationActionResult<T> {
  return { ok: false, message, fieldErrors };
}

function success<T = undefined>(message: string, data?: T): ReservationActionResult<T> {
  return { ok: true, message, data };
}

function refreshModules() {
  revalidatePath("/reservas");
  revalidatePath("/quartos");
  revalidatePath("/dashboard");
  revalidatePath("/historico");
  revalidatePath("/financeiro");
}

function sanitizeFileName(name: string) {
  const extension = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase()}` : "";
  const base = name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "arquivo";
  return `${base}${extension}`;
}

async function ensureReservation(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, hotelId: string, id: string) {
  const { data, error } = await supabase.from("reservations").select("id, status").eq("id", id).eq("hotel_id", hotelId).maybeSingle();
  if (error || !data) return null;
  return data as { id: string; status: string };
}

async function uploadAttachment(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  hotelId: string,
  entityType: "reservation" | "payment",
  entityId: string,
  category: "reservation_proof" | "payment_proof" | "refund_proof" | "identity_document" | "other",
  file: File,
  description?: string | null,
) {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) return { error: "Envie um arquivo JPEG, PNG, WebP ou PDF." };
  if (file.size > MAX_FILE_SIZE) return { error: "O arquivo deve ter no máximo 10 MB." };

  const storagePath = `${hotelId}/${entityType}/${entityId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage.from("e-hotel-private").upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return { error: "Não foi possível enviar o comprovante." };

  const { error: metadataError } = await supabase.from("attachments").insert({
    hotel_id: hotelId,
    entity_type: entityType,
    entity_id: entityId,
    category,
    bucket_id: "e-hotel-private",
    storage_path: storagePath,
    original_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    description: description || null,
  });
  if (metadataError) {
    await supabase.storage.from("e-hotel-private").remove([storagePath]);
    return { error: databaseMessage(metadataError.message) };
  }
  return { storagePath };
}

export async function saveCustomerAction(formData: FormData): Promise<ReservationActionResult<{ customerId: string }>> {
  const access = await requireHotelAccess(OPERATION_ROLES);
  const id = textValue(formData, "id");
  const customerType = textValue(formData, "customer_type") as CustomerType;
  const documentType = optionalText(formData, "document_type") as DocumentType | null;
  const name = textValue(formData, "name");
  const birthDate = optionalText(formData, "birth_date");
  const email = optionalText(formData, "email");
  const fieldErrors: Record<string, string> = {};

  if (!CUSTOMER_TYPES.includes(customerType)) fieldErrors.customer_type = "Selecione o tipo de cliente.";
  if (name.length < 2) fieldErrors.name = "Informe o nome completo ou a razão social.";
  if (documentType && !DOCUMENT_TYPES.includes(documentType)) fieldErrors.document_type = "Selecione um documento válido.";
  if (customerType === "company" && birthDate) fieldErrors.birth_date = "Empresas não possuem data de nascimento.";
  if (birthDate && (!dateIsValid(birthDate) || new Date(`${birthDate}T12:00:00`) > new Date())) fieldErrors.birth_date = "Informe uma data de nascimento válida.";
  if (email && !/^\S+@\S+\.\S+$/.test(email)) fieldErrors.email = "Informe um e-mail válido.";
  if (Object.keys(fieldErrors).length) return failure("Revise os campos destacados.", fieldErrors);

  const payload = {
    customer_type: customerType,
    name,
    trade_name: optionalText(formData, "trade_name"),
    document_type: documentType,
    document: optionalText(formData, "document"),
    birth_date: birthDate,
    nationality: optionalText(formData, "nationality"),
    phone: optionalText(formData, "phone"),
    secondary_phone: optionalText(formData, "secondary_phone"),
    email,
    contact_name: optionalText(formData, "contact_name"),
    contact_phone: optionalText(formData, "contact_phone"),
    contact_email: optionalText(formData, "contact_email"),
    postal_code: optionalText(formData, "postal_code"),
    street: optionalText(formData, "street"),
    street_number: optionalText(formData, "street_number"),
    address_complement: optionalText(formData, "address_complement"),
    neighborhood: optionalText(formData, "neighborhood"),
    city: optionalText(formData, "city"),
    state: optionalText(formData, "state")?.toUpperCase() || null,
    country_code: (optionalText(formData, "country_code") || "BR").toUpperCase(),
    notes: optionalText(formData, "notes"),
  };
  const supabase = await createSupabaseServerClient();
  const query = id
    ? supabase.from("customers").update(payload).eq("id", id).eq("hotel_id", access.hotelId).select("id").single()
    : supabase.from("customers").insert({ ...payload, hotel_id: access.hotelId }).select("id").single();
  const { data, error } = await query;
  if (error || !data) return failure(error ? databaseMessage(error.message) : "Não foi possível salvar o cliente.");
  revalidatePath("/reservas");
  return success(id ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso.", { customerId: data.id });
}

export async function archiveCustomerAction(id: string): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(OPERATION_ROLES);
  if (!id) return failure("Cliente inválido.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("customers").update({ status: "archived" }).eq("id", id).eq("hotel_id", access.hotelId).eq("status", "active");
  if (error) return failure(databaseMessage(error.message));
  revalidatePath("/reservas");
  return success("Cliente arquivado. O histórico foi preservado.");
}

export async function getAvailableRoomsAction(input: {
  checkinDate: string;
  checkoutDate: string;
  roomTypeId?: string;
  minCapacity?: number;
  excludeReservationId?: string;
}): Promise<ReservationActionResult<AvailableRoomRow[]>> {
  const access = await requireHotelAccess();
  if (!dateIsValid(input.checkinDate) || !dateIsValid(input.checkoutDate) || input.checkoutDate <= input.checkinDate) {
    return failure("Informe um período válido para consultar a disponibilidade.");
  }
  const supabase = await createSupabaseServerClient();
  const params = {
    p_hotel_id: access.hotelId,
    p_checkin_date: input.checkinDate,
    p_checkout_date: input.checkoutDate,
    p_room_type_id: input.roomTypeId || null,
    p_min_capacity: Math.max(1, Number(input.minCapacity) || 1),
    p_exclude_reservation_id: input.excludeReservationId || null,
  };
  let { data, error } = await supabase.rpc("get_available_rooms", params);
  if (error && /function .* does not exist|schema cache|could not find/i.test(error.message)) {
    ({ data, error } = await supabase.rpc("get_available_rooms", {
      p_hotel_id: access.hotelId,
      p_start_date: input.checkinDate,
      p_end_date: input.checkoutDate,
      p_room_type_id: input.roomTypeId || null,
      p_capacity: Math.max(1, Number(input.minCapacity) || 1),
    }));
  }
  if (error) return failure(databaseMessage(error.message));
  const normalized = ((data ?? []) as Array<Record<string, unknown>>).map((room) => ({
    id: String(room.room_id ?? room.id),
    room_id: String(room.room_id ?? room.id),
    number: String(room.room_number ?? room.number ?? ""),
    name: room.room_name == null && room.name == null ? null : String(room.room_name ?? room.name),
    room_type_id: String(room.room_type_id ?? ""),
    room_type_name: String(room.room_type_name ?? room.type_name ?? "Quarto"),
    capacity: Number(room.capacity ?? 1),
    default_daily_rate: Number(room.default_daily_rate ?? room.daily_rate ?? 0),
    floor: room.floor == null ? null : String(room.floor),
  }));
  return success(`${normalized.length} quarto(s) disponível(is) no período.`, normalized);
}

export async function saveReservationAction(formData: FormData): Promise<ReservationActionResult<{ reservationId: string }>> {
  const access = await requireHotelAccess(OPERATION_ROLES);
  const id = textValue(formData, "id");
  const customerId = textValue(formData, "customer_id");
  const reservationType = textValue(formData, "reservation_type") as ReservationType;
  const source = textValue(formData, "source") as ReservationSource;
  const checkinDate = textValue(formData, "checkin_date");
  const checkoutDate = textValue(formData, "checkout_date");
  const adultsCount = numberValue(formData, "adults_count");
  const childrenCount = numberValue(formData, "children_count");
  const submitStatus = textValue(formData, "submit_status") === "draft" ? "draft" : "pending";
  const rooms = parseJsonArray<ReservationRoomInput>(formData, "rooms_json");
  const guests = parseJsonArray<ReservationGuestInput>(formData, "guests_json");
  const fieldErrors: Record<string, string> = {};

  if (!customerId) fieldErrors.customer_id = "Selecione o cliente responsável.";
  if (!RESERVATION_TYPES.includes(reservationType)) fieldErrors.reservation_type = "Selecione o tipo da reserva.";
  if (!RESERVATION_SOURCES.includes(source)) fieldErrors.source = "Selecione a origem da reserva.";
  if (!dateIsValid(checkinDate)) fieldErrors.checkin_date = "Informe a data de entrada.";
  if (!dateIsValid(checkoutDate) || checkoutDate <= checkinDate) fieldErrors.checkout_date = "A saída deve ser posterior à entrada.";
  if (!Number.isInteger(adultsCount) || adultsCount < 0) fieldErrors.adults_count = "Informe a quantidade de adultos.";
  if (!Number.isInteger(childrenCount) || childrenCount < 0 || adultsCount + childrenCount < 1) fieldErrors.children_count = "A reserva deve possuir ao menos um hóspede.";
  if (!rooms || (submitStatus === "pending" && rooms.length === 0)) fieldErrors.rooms = "Selecione ao menos um quarto para criar a reserva.";
  if (!guests) fieldErrors.guests = "Os dados dos hóspedes estão inválidos.";
  if (Object.keys(fieldErrors).length) return failure("Revise os campos destacados.", fieldErrors);

  const roomIds = rooms!.map((room) => room.room_id);
  if (new Set(roomIds).size !== roomIds.length) return failure("O mesmo quarto não pode ser incluído duas vezes.", { rooms: "Remova quartos duplicados." });
  for (const room of rooms!) {
    if (!room.room_id || !Number.isInteger(Number(room.guests_count)) || Number(room.guests_count) < 1 || !Number.isFinite(Number(room.daily_rate)) || Number(room.daily_rate) < 0) {
      return failure("Revise a ocupação e a diária dos quartos selecionados.", { rooms: "Existe um quarto com dados inválidos." });
    }
  }
  const primaryGuests = guests!.filter((guest) => guest.is_primary);
  if (guests!.some((guest) => guest.name.trim().length < 2) || primaryGuests.length > 1) {
    return failure("Revise os hóspedes da reserva.", { guests: primaryGuests.length > 1 ? "Defina apenas um hóspede principal." : "Informe o nome de todos os hóspedes." });
  }

  const supabase = await createSupabaseServerClient();
  const { data: customer, error: customerError } = await supabase.from("customers").select("id, customer_type, status").eq("id", customerId).eq("hotel_id", access.hotelId).maybeSingle();
  if (customerError || !customer || customer.status !== "active") return failure("O cliente selecionado não está disponível para uma nova reserva.", { customer_id: "Selecione um cliente ativo." });
  if (reservationType === "company" && customer.customer_type !== "company") return failure("Reservas empresariais exigem um cliente do tipo empresa.", { customer_id: "Selecione uma empresa." });

  if (id) {
    const current = await ensureReservation(supabase, access.hotelId, id);
    if (!current) return failure("Reserva não encontrada.");
    if (CLOSED_RESERVATIONS.includes(current.status)) return failure("Esta reserva está encerrada e não pode ser editada.");
  }

  const payload: Record<string, unknown> = {
    customer_id: customerId,
    reservation_type: reservationType,
    checkin_date: checkinDate,
    checkout_date: checkoutDate,
    adults_count: adultsCount,
    children_count: childrenCount,
    contact_name: optionalText(formData, "contact_name"),
    contact_phone: optionalText(formData, "contact_phone"),
    contact_email: optionalText(formData, "contact_email"),
    origin_city: optionalText(formData, "origin_city"),
    vehicle_plate: optionalText(formData, "vehicle_plate")?.toUpperCase() || null,
    source,
    customer_notes: optionalText(formData, "customer_notes"),
    internal_notes: optionalText(formData, "internal_notes"),
  };
  const expectedCheckin = optionalTimestamp(textValue(formData, "expected_checkin_at"));
  const expectedCheckout = optionalTimestamp(textValue(formData, "expected_checkout_at"));
  if (expectedCheckin) payload.expected_checkin_at = expectedCheckin;
  if (expectedCheckout) payload.expected_checkout_at = expectedCheckout;

  let reservationId = id;
  let createdNow = false;
  if (id) {
    const { error } = await supabase.from("reservations").update(payload).eq("id", id).eq("hotel_id", access.hotelId);
    if (error) return failure(databaseMessage(error.message));
  } else {
    const { data, error } = await supabase.from("reservations").insert({ ...payload, hotel_id: access.hotelId, status: submitStatus }).select("id").single();
    if (error || !data) return failure(error ? databaseMessage(error.message) : "Não foi possível criar a reserva.");
    reservationId = data.id;
    createdNow = true;
  }

  const rollbackNewReservation = async () => {
    if (createdNow) await supabase.from("reservations").delete().eq("id", reservationId).eq("hotel_id", access.hotelId).eq("status", submitStatus);
  };

  const { data: existingRooms, error: existingRoomsError } = await supabase.from("reservation_rooms").select("id, room_id").eq("reservation_id", reservationId).eq("hotel_id", access.hotelId);
  if (existingRoomsError) {
    await rollbackNewReservation();
    return failure(databaseMessage(existingRoomsError.message));
  }
  const existingByPhysicalRoom = new Map((existingRooms ?? []).map((room) => [room.room_id, room.id]));
  const selectedIds = new Set(roomIds);

  for (const room of rooms!) {
    const roomPayload = { guests_count: Number(room.guests_count), daily_rate: Number(room.daily_rate), notes: room.notes?.trim() || null };
    const existingId = existingByPhysicalRoom.get(room.room_id);
    const { error } = existingId
      ? await supabase.from("reservation_rooms").update(roomPayload).eq("id", existingId).eq("reservation_id", reservationId).eq("hotel_id", access.hotelId)
      : await supabase.from("reservation_rooms").insert({ ...roomPayload, hotel_id: access.hotelId, reservation_id: reservationId, room_id: room.room_id });
    if (error) {
      await rollbackNewReservation();
      return failure(databaseMessage(error.message));
    }
  }
  const roomsToRemove = (existingRooms ?? []).filter((room) => !selectedIds.has(room.room_id)).map((room) => room.id);

  const { data: savedRooms, error: savedRoomsError } = await supabase.from("reservation_rooms").select("id, room_id").eq("reservation_id", reservationId).eq("hotel_id", access.hotelId);
  if (savedRoomsError) return failure(databaseMessage(savedRoomsError.message));
  const reservationRoomByPhysicalRoom = new Map((savedRooms ?? []).map((room) => [room.room_id, room.id]));

  const { data: existingGuests, error: existingGuestsError } = await supabase
    .from("reservation_guests")
    .select("id")
    .eq("reservation_id", reservationId)
    .eq("hotel_id", access.hotelId);
  if (existingGuestsError) return failure(databaseMessage(existingGuestsError.message));
  const existingGuestIds = new Set((existingGuests ?? []).map((guest) => guest.id));
  const retainedGuestIds = new Set<string>();

  if (existingGuestIds.size) {
    const { error } = await supabase
      .from("reservation_guests")
      .update({ is_primary: false })
      .eq("reservation_id", reservationId)
      .eq("hotel_id", access.hotelId)
      .eq("is_primary", true);
    if (error) return failure(databaseMessage(error.message));
  }

  for (const guest of [...guests!].sort((a, b) => Number(a.is_primary) - Number(b.is_primary))) {
    const guestPayload = {
      hotel_id: access.hotelId,
      reservation_id: reservationId,
      reservation_room_id: guest.room_id ? reservationRoomByPhysicalRoom.get(guest.room_id) ?? null : guest.reservation_room_id || null,
      customer_id: guest.customer_id || null,
      name: guest.name.trim(),
      document_type: guest.document_type || null,
      document: guest.document?.trim() || null,
      birth_date: guest.birth_date || null,
      phone: guest.phone?.trim() || null,
      is_primary: Boolean(guest.is_primary),
      legal_responsible_name: guest.legal_responsible_name?.trim() || null,
      legal_responsible_document: guest.legal_responsible_document?.trim() || null,
      legal_responsible_phone: guest.legal_responsible_phone?.trim() || null,
      notes: guest.notes?.trim() || null,
    };
    const existingGuestId = guest.id && existingGuestIds.has(guest.id) ? guest.id : null;
    const { data: savedGuest, error } = existingGuestId
      ? await supabase.from("reservation_guests").update(guestPayload).eq("id", existingGuestId).eq("reservation_id", reservationId).eq("hotel_id", access.hotelId).select("id").single()
      : await supabase.from("reservation_guests").insert(guestPayload).select("id").single();
    if (error) return failure(databaseMessage(error.message));
    if (savedGuest) retainedGuestIds.add(savedGuest.id);
  }

  const guestsToRemove = [...existingGuestIds].filter((guestId) => !retainedGuestIds.has(guestId));
  if (guestsToRemove.length) {
    const { error } = await supabase.from("reservation_guests").delete().in("id", guestsToRemove).eq("reservation_id", reservationId).eq("hotel_id", access.hotelId);
    if (error) return failure(databaseMessage(error.message));
  }
  if (roomsToRemove.length) {
    const { error } = await supabase.from("reservation_rooms").delete().in("id", roomsToRemove).eq("reservation_id", reservationId).eq("hotel_id", access.hotelId);
    if (error) return failure(databaseMessage(error.message));
  }

  refreshModules();
  return success(id ? "Reserva atualizada com sucesso." : submitStatus === "draft" ? "Rascunho salvo com sucesso." : "Reserva criada com sucesso.", { reservationId });
}

async function updateReservationStatus(id: string, target: "confirmed" | "no_show") {
  const access = await requireHotelAccess(OPERATION_ROLES);
  const supabase = await createSupabaseServerClient();
  const current = await ensureReservation(supabase, access.hotelId, id);
  if (!current) return failure("Reserva não encontrada.");
  const allowed = target === "confirmed" ? ["pending"] : ["pending", "confirmed"];
  if (!allowed.includes(current.status)) return failure("A reserva não está em uma situação compatível com esta ação.");
  const payload = target === "confirmed" ? { status: target, confirmation_type: "manual" } : { status: target };
  const { error } = await supabase.from("reservations").update(payload).eq("id", id).eq("hotel_id", access.hotelId).in("status", allowed);
  if (error) return failure(databaseMessage(error.message));
  refreshModules();
  return success(target === "confirmed" ? "Reserva confirmada com sucesso." : "Reserva marcada como não compareceu.");
}

export async function confirmReservationAction(id: string) { return updateReservationStatus(id, "confirmed"); }
export async function markNoShowAction(id: string) { return updateReservationStatus(id, "no_show"); }

async function callReservationRpc(name: "check_in_reservation" | "check_out_reservation" | "cancel_reservation", reservationId: string, reason?: string) {
  const access = await requireHotelAccess(OPERATION_ROLES);
  const supabase = await createSupabaseServerClient();
  const current = await ensureReservation(supabase, access.hotelId, reservationId);
  if (!current) return failure("Reserva não encontrada.");
  const params: Record<string, unknown> = { p_reservation_id: reservationId };
  if (reason) params.p_reason = reason;
  let { error } = await supabase.rpc(name, params);
  if (error && /function .* does not exist|schema cache|could not find/i.test(error.message)) {
    const alternative: Record<string, unknown> = { reservation_id: reservationId };
    if (reason) alternative.reason = reason;
    ({ error } = await supabase.rpc(name, alternative));
  }
  if (error) return failure(databaseMessage(error.message));
  refreshModules();
  const messages = { check_in_reservation: "Check-in realizado com sucesso.", check_out_reservation: "Check-out realizado com sucesso.", cancel_reservation: "Reserva cancelada com sucesso." };
  return success(messages[name]);
}

export async function checkInReservationAction(id: string) { return callReservationRpc("check_in_reservation", id); }
export async function checkOutReservationAction(id: string) { return callReservationRpc("check_out_reservation", id); }
export async function cancelReservationAction(id: string, reason: string) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 3) return failure("Informe o motivo do cancelamento.", { reason: "O motivo é obrigatório." });
  return callReservationRpc("cancel_reservation", id, cleanReason);
}

export async function saveChargeAction(formData: FormData): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(PAYMENT_ROLES);
  const reservationId = textValue(formData, "reservation_id");
  const chargeType = textValue(formData, "charge_type") as ChargeType;
  const description = textValue(formData, "description");
  const quantity = numberValue(formData, "quantity");
  const unitAmount = numberValue(formData, "unit_amount");
  const fieldErrors: Record<string, string> = {};
  if (!CHARGE_TYPES.includes(chargeType)) fieldErrors.charge_type = "Selecione o tipo da cobrança.";
  if (description.length < 2) fieldErrors.description = "Informe a descrição.";
  if (!Number.isFinite(quantity) || quantity <= 0) fieldErrors.quantity = "A quantidade deve ser maior que zero.";
  if (!Number.isFinite(unitAmount)) fieldErrors.unit_amount = "Informe um valor válido.";
  if (chargeType === "discount" && unitAmount > 0) fieldErrors.unit_amount = "Descontos devem usar valor zero ou negativo.";
  if (["extra", "service", "fee"].includes(chargeType) && unitAmount < 0) fieldErrors.unit_amount = "Este tipo de cobrança não aceita valor negativo.";
  if (Object.keys(fieldErrors).length) return failure("Revise os campos destacados.", fieldErrors);
  const supabase = await createSupabaseServerClient();
  const reservation = await ensureReservation(supabase, access.hotelId, reservationId);
  if (!reservation || CLOSED_RESERVATIONS.includes(reservation.status)) return failure("A reserva não está disponível para novas cobranças.");
  const { error } = await supabase.from("reservation_charges").insert({
    hotel_id: access.hotelId,
    reservation_id: reservationId,
    reservation_room_id: optionalText(formData, "reservation_room_id"),
    charge_type: chargeType,
    description,
    quantity,
    unit_amount: unitAmount,
    charge_date: optionalText(formData, "charge_date") || undefined,
    notes: optionalText(formData, "notes"),
  });
  if (error) return failure(databaseMessage(error.message));
  refreshModules();
  return success("Cobrança adicionada com sucesso.");
}

export async function voidChargeAction(id: string): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(PAYMENT_ROLES);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("reservation_charges").update({ status: "void" }).eq("id", id).eq("hotel_id", access.hotelId).eq("status", "active");
  if (error) return failure(databaseMessage(error.message));
  refreshModules();
  return success("Cobrança anulada. O histórico foi preservado.");
}

export async function savePaymentAction(formData: FormData): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(PAYMENT_ROLES);
  const reservationId = textValue(formData, "reservation_id");
  const methodId = textValue(formData, "payment_method_id");
  const amount = numberValue(formData, "amount");
  const confirmNow = textValue(formData, "confirm_now") !== "false";
  const fileValue = formData.get("attachment");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  const fieldErrors: Record<string, string> = {};
  if (!methodId) fieldErrors.payment_method_id = "Selecione a forma de pagamento.";
  if (!Number.isFinite(amount) || amount <= 0) fieldErrors.amount = "Informe um valor maior que zero.";
  if (Object.keys(fieldErrors).length) return failure("Revise os campos destacados.", fieldErrors);

  const supabase = await createSupabaseServerClient();
  const [reservation, methodResult] = await Promise.all([
    ensureReservation(supabase, access.hotelId, reservationId),
    supabase.from("payment_methods").select("id, requires_attachment, is_active").eq("id", methodId).eq("hotel_id", access.hotelId).maybeSingle(),
  ]);
  if (!reservation || ["draft", "cancelled", "no_show"].includes(reservation.status)) return failure("A reserva não aceita novos pagamentos.");
  const method = methodResult.data;
  if (methodResult.error || !method || !method.is_active) return failure("A forma de pagamento selecionada não está disponível.");
  if (method.requires_attachment && confirmNow && !file) return failure("Este método exige um comprovante para confirmar o pagamento.", { attachment: "Anexe o comprovante." });

  const paidAtRaw = textValue(formData, "paid_at");
  const { data: payment, error: insertError } = await supabase.from("payments").insert({
    hotel_id: access.hotelId,
    reservation_id: reservationId,
    payment_method_id: methodId,
    payment_type: "payment",
    status: "pending",
    amount,
    paid_at: optionalTimestamp(paidAtRaw) || new Date().toISOString(),
    external_reference: optionalText(formData, "external_reference"),
    notes: optionalText(formData, "notes"),
  }).select("id").single();
  if (insertError || !payment) return failure(insertError ? databaseMessage(insertError.message) : "Não foi possível registrar o pagamento.");

  if (file) {
    const upload = await uploadAttachment(supabase, access.hotelId, "payment", payment.id, "payment_proof", file, "Comprovante do pagamento");
    if (upload.error) {
      await supabase.from("payments").delete().eq("id", payment.id).eq("hotel_id", access.hotelId).eq("status", "pending");
      return failure(upload.error, { attachment: upload.error });
    }
  }
  if (confirmNow) {
    const { error } = await supabase.from("payments").update({ status: "confirmed" }).eq("id", payment.id).eq("hotel_id", access.hotelId).eq("status", "pending");
    if (error) return failure(databaseMessage(error.message));
  }
  refreshModules();
  return success(confirmNow ? "Pagamento confirmado com sucesso." : "Pagamento salvo como pendente.");
}

export async function confirmPaymentAction(id: string): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(PAYMENT_ROLES);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("payments").update({ status: "confirmed" }).eq("id", id).eq("hotel_id", access.hotelId).eq("status", "pending");
  if (error) return failure(databaseMessage(error.message));
  refreshModules();
  return success("Pagamento confirmado com sucesso.");
}

export async function cancelPaymentAction(id: string, reason: string): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(PAYMENT_ROLES);
  if (reason.trim().length < 3) return failure("Informe o motivo do cancelamento.", { reason: "O motivo é obrigatório." });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("payments").update({ status: "cancelled", cancel_reason: reason.trim() }).eq("id", id).eq("hotel_id", access.hotelId).in("status", ["pending", "confirmed"]);
  if (error) return failure(databaseMessage(error.message));
  refreshModules();
  return success("Pagamento cancelado com sucesso.");
}

export async function refundPaymentAction(formData: FormData): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(PAYMENT_ROLES);
  const originalPaymentId = textValue(formData, "original_payment_id");
  const amount = numberValue(formData, "amount");
  const fileValue = formData.get("attachment");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  if (!Number.isFinite(amount) || amount <= 0) return failure("Informe um valor de estorno maior que zero.", { amount: "Valor inválido." });
  const supabase = await createSupabaseServerClient();
  const { data: original, error: originalError } = await supabase.from("payments").select("id, reservation_id, payment_method_id, amount, status, payment_methods(requires_attachment)").eq("id", originalPaymentId).eq("hotel_id", access.hotelId).eq("payment_type", "payment").maybeSingle();
  if (originalError || !original || original.status !== "confirmed") return failure("O pagamento original não está disponível para estorno.");
  const relatedMethod = Array.isArray(original.payment_methods) ? original.payment_methods[0] : original.payment_methods;
  if (relatedMethod?.requires_attachment && !file) return failure("Esta forma de pagamento exige um comprovante para confirmar o estorno.", { attachment: "Anexe o comprovante do estorno." });
  const { data: refunds } = await supabase.from("payments").select("amount").eq("original_payment_id", originalPaymentId).eq("hotel_id", access.hotelId).eq("payment_type", "refund").eq("status", "confirmed");
  const alreadyRefunded = (refunds ?? []).reduce((sum, item) => sum + Number(item.amount), 0);
  if (alreadyRefunded + amount > Number(original.amount)) return failure("O estorno ultrapassa o valor ainda disponível do pagamento.", { amount: "Reduza o valor do estorno." });
  const { data: refund, error } = await supabase.from("payments").insert({
    hotel_id: access.hotelId,
    reservation_id: original.reservation_id,
    payment_method_id: original.payment_method_id,
    payment_type: "refund",
    original_payment_id: originalPaymentId,
    status: "pending",
    amount,
    paid_at: new Date().toISOString(),
    notes: optionalText(formData, "notes"),
  }).select("id").single();
  if (error || !refund) return failure(error ? databaseMessage(error.message) : "Não foi possível registrar o estorno.");
  if (file) {
    const upload = await uploadAttachment(supabase, access.hotelId, "payment", refund.id, "refund_proof", file, "Comprovante do estorno");
    if (upload.error) {
      await supabase.from("payments").delete().eq("id", refund.id).eq("hotel_id", access.hotelId).eq("status", "pending");
      return failure(upload.error, { attachment: upload.error });
    }
  }
  const { error: confirmationError } = await supabase.from("payments").update({ status: "confirmed" }).eq("id", refund.id).eq("hotel_id", access.hotelId).eq("status", "pending");
  if (confirmationError) return failure(databaseMessage(confirmationError.message));
  refreshModules();
  return success("Estorno confirmado com sucesso.");
}

export async function uploadReservationAttachmentAction(formData: FormData): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(OPERATION_ROLES);
  const reservationId = textValue(formData, "reservation_id");
  const categoryValue = textValue(formData, "category");
  const category = categoryValue === "identity_document" ? "identity_document" : categoryValue === "reservation_proof" ? "reservation_proof" : "other";
  const fileValue = formData.get("attachment");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  if (!file) return failure("Selecione um arquivo para enviar.", { attachment: "O arquivo é obrigatório." });
  const supabase = await createSupabaseServerClient();
  const reservation = await ensureReservation(supabase, access.hotelId, reservationId);
  if (!reservation) return failure("Reserva não encontrada.");
  const upload = await uploadAttachment(supabase, access.hotelId, "reservation", reservationId, category, file, optionalText(formData, "description"));
  if (upload.error) return failure(upload.error, { attachment: upload.error });
  revalidatePath("/reservas");
  return success("Documento anexado à reserva com sucesso.");
}

export async function addReservationNoteAction(id: string, note: string): Promise<ReservationActionResult> {
  const access = await requireHotelAccess(OPERATION_ROLES);
  const cleanNote = note.trim();
  if (cleanNote.length < 2) return failure("Digite uma nota antes de salvar.", { note: "A nota está vazia." });
  const supabase = await createSupabaseServerClient();
  const reservation = await ensureReservation(supabase, access.hotelId, id);
  if (!reservation) return failure("Reserva não encontrada.");
  let { error } = await supabase.rpc("add_reservation_event_note", { p_reservation_id: id, p_note: cleanNote });
  if (error && /function .* does not exist|schema cache|could not find/i.test(error.message)) {
    ({ error } = await supabase.rpc("add_reservation_event_note", { reservation_id: id, note: cleanNote }));
  }
  if (error) return failure(databaseMessage(error.message));
  revalidatePath("/reservas");
  return success("Nota adicionada à linha do tempo.");
}

export async function getAttachmentUrlAction(id: string): Promise<ReservationActionResult<{ url: string }>> {
  const access = await requireHotelAccess();
  const supabase = await createSupabaseServerClient();
  const { data: attachment, error } = await supabase.from("attachments").select("storage_path").eq("id", id).eq("hotel_id", access.hotelId).maybeSingle();
  if (error || !attachment) return failure("Arquivo não encontrado.");
  const { data, error: signedError } = await supabase.storage.from("e-hotel-private").createSignedUrl(attachment.storage_path, 60);
  if (signedError || !data) return failure("Não foi possível abrir o arquivo.");
  return success("Arquivo disponível.", { url: data.signedUrl });
}
