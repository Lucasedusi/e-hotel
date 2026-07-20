"use server";

import { revalidatePath } from "next/cache";
import { requireHotelAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ROOM_BLOCK_TYPES,
  ROOM_OPERATIONAL_STATUSES,
  type RoomActionResult,
  type RoomBlockType,
  type RoomOperationalStatus,
} from "@/types/rooms";

const ROOM_MANAGERS = ["owner", "admin", "reception"] as const;
const HOTEL_MANAGERS = ["owner", "admin"] as const;

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function optionalText(formData: FormData, name: string) {
  const value = textValue(formData, name);
  return value || null;
}

function numberValue(formData: FormData, name: string) {
  const raw = textValue(formData, name).replace(",", ".");
  return Number(raw);
}

function parseDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function databaseMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("duplicate") || normalized.includes("unique")) {
    return "Já existe um cadastro com essa informação neste hotel.";
  }
  if (normalized.includes("overlap") || normalized.includes("sobrepos")) {
    return "O período informado se sobrepõe a outra reserva ou bloqueio do quarto.";
  }
  if (normalized.includes("foreign key") || normalized.includes("violates")) {
    return "Este registro possui vínculos e não pode ser removido.";
  }
  if (normalized.includes("permission") || normalized.includes("policy")) {
    return "Você não possui permissão para concluir esta ação.";
  }

  return "Não foi possível concluir a ação. Confira os dados e tente novamente.";
}

function failure(message: string, fieldErrors?: Record<string, string>): RoomActionResult {
  return { ok: false, message, fieldErrors };
}

function success(message: string): RoomActionResult {
  revalidatePath("/quartos");
  return { ok: true, message };
}

export async function saveRoomTypeAction(formData: FormData): Promise<RoomActionResult> {
  const access = await requireHotelAccess(HOTEL_MANAGERS);
  const id = textValue(formData, "id");
  const name = textValue(formData, "name");
  const capacity = numberValue(formData, "default_capacity");
  const rate = numberValue(formData, "default_daily_rate");
  const fieldErrors: Record<string, string> = {};

  if (name.length < 2) fieldErrors.name = "Informe um nome com pelo menos 2 caracteres.";
  if (!Number.isInteger(capacity) || capacity < 1) {
    fieldErrors.default_capacity = "A capacidade deve ser um número inteiro maior que zero.";
  }
  if (!Number.isFinite(rate) || rate < 0) {
    fieldErrors.default_daily_rate = "A diária não pode ser negativa.";
  }
  if (Object.keys(fieldErrors).length) return failure("Revise os campos destacados.", fieldErrors);

  const payload = {
    name,
    description: optionalText(formData, "description"),
    default_capacity: capacity,
    default_daily_rate: rate,
    is_active: textValue(formData, "is_active") !== "false",
  };
  const supabase = await createSupabaseServerClient();
  const query = id
    ? supabase.from("room_types").update(payload).eq("id", id).eq("hotel_id", access.hotelId)
    : supabase.from("room_types").insert({ ...payload, hotel_id: access.hotelId });
  const { error } = await query;

  if (error) return failure(databaseMessage(error.message));
  return success(id ? "Tipo de quarto atualizado com sucesso." : "Tipo de quarto criado com sucesso.");
}

export async function deleteRoomTypeAction(id: string): Promise<RoomActionResult> {
  const access = await requireHotelAccess(HOTEL_MANAGERS);
  if (!id) return failure("Tipo de quarto inválido.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("room_types")
    .delete()
    .eq("id", id)
    .eq("hotel_id", access.hotelId);

  if (error) return failure(databaseMessage(error.message));
  return success("Tipo de quarto removido com sucesso.");
}

export async function saveRoomAction(formData: FormData): Promise<RoomActionResult> {
  const access = await requireHotelAccess(ROOM_MANAGERS);
  const id = textValue(formData, "id");
  const number = textValue(formData, "number");
  const roomTypeId = textValue(formData, "room_type_id");
  const capacity = numberValue(formData, "capacity");
  const rate = numberValue(formData, "default_daily_rate");
  const status = textValue(formData, "operational_status") as RoomOperationalStatus;
  const fieldErrors: Record<string, string> = {};

  if (!number) fieldErrors.number = "Informe o número ou identificação do quarto.";
  if (!roomTypeId) fieldErrors.room_type_id = "Selecione o tipo do quarto.";
  if (!Number.isInteger(capacity) || capacity < 1) fieldErrors.capacity = "Informe uma capacidade válida.";
  if (!Number.isFinite(rate) || rate < 0) fieldErrors.default_daily_rate = "A diária não pode ser negativa.";
  if (!ROOM_OPERATIONAL_STATUSES.includes(status)) fieldErrors.operational_status = "Selecione uma situação válida.";
  if (Object.keys(fieldErrors).length) return failure("Revise os campos destacados.", fieldErrors);

  const payload = {
    room_type_id: roomTypeId,
    number,
    name: optionalText(formData, "name"),
    floor: optionalText(formData, "floor"),
    capacity,
    default_daily_rate: rate,
    operational_status: status,
    notes: optionalText(formData, "notes"),
  };
  const supabase = await createSupabaseServerClient();
  const query = id
    ? supabase.from("rooms").update(payload).eq("id", id).eq("hotel_id", access.hotelId)
    : supabase.from("rooms").insert({ ...payload, hotel_id: access.hotelId });
  const { error } = await query;

  if (error) return failure(databaseMessage(error.message));
  return success(id ? "Quarto atualizado com sucesso." : "Quarto cadastrado com sucesso.");
}

export async function deleteRoomAction(id: string): Promise<RoomActionResult> {
  const access = await requireHotelAccess(HOTEL_MANAGERS);
  if (!id) return failure("Quarto inválido.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("rooms").delete().eq("id", id).eq("hotel_id", access.hotelId);
  if (error) return failure(databaseMessage(error.message));
  return success("Quarto removido com sucesso.");
}

export async function saveRoomBlockAction(formData: FormData): Promise<RoomActionResult> {
  const access = await requireHotelAccess(ROOM_MANAGERS);
  const id = textValue(formData, "id");
  const roomId = textValue(formData, "room_id");
  const blockType = textValue(formData, "block_type") as RoomBlockType;
  const startAt = parseDate(textValue(formData, "start_at"));
  const endAt = parseDate(textValue(formData, "end_at"));
  const reason = textValue(formData, "reason");
  const fieldErrors: Record<string, string> = {};

  if (!roomId) fieldErrors.room_id = "Selecione o quarto.";
  if (!ROOM_BLOCK_TYPES.includes(blockType)) fieldErrors.block_type = "Selecione um tipo de bloqueio válido.";
  if (!startAt) fieldErrors.start_at = "Informe o início do bloqueio.";
  if (!endAt) fieldErrors.end_at = "Informe o fim do bloqueio.";
  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
    fieldErrors.end_at = "O fim deve ser posterior ao início.";
  }
  if (reason.length < 3) fieldErrors.reason = "Explique o motivo do bloqueio.";
  if (Object.keys(fieldErrors).length) return failure("Revise os campos destacados.", fieldErrors);

  const supabase = await createSupabaseServerClient();
  const payload = {
    block_type: blockType,
    start_at: startAt!,
    end_at: endAt!,
    reason,
    notes: optionalText(formData, "notes"),
  };
  const query = id
    ? supabase.from("room_blocks").update(payload).eq("id", id).eq("hotel_id", access.hotelId).eq("room_id", roomId)
    : supabase.from("room_blocks").insert({ ...payload, hotel_id: access.hotelId, room_id: roomId });
  const { error } = await query;

  if (error) return failure(databaseMessage(error.message));
  return success(id ? "Bloqueio atualizado com sucesso." : "Bloqueio criado com sucesso.");
}

export async function cancelRoomBlockAction(id: string): Promise<RoomActionResult> {
  const access = await requireHotelAccess(ROOM_MANAGERS);
  if (!id) return failure("Bloqueio inválido.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("room_blocks")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("hotel_id", access.hotelId)
    .in("status", ["scheduled", "active"]);

  if (error) return failure(databaseMessage(error.message));
  return success("Bloqueio cancelado com sucesso.");
}
