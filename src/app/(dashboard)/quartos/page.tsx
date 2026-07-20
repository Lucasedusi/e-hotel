import { RoomsModule } from "@/components/rooms/RoomsModule";
import { requireHotelAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ROOM_OCCUPANCY_STATUSES,
  type RoomBlockRow,
  type RoomCalendarEvent,
  type RoomOccupancyStatus,
  type RoomRow,
  type RoomTypeRow,
} from "@/types/rooms";

export const dynamic = "force-dynamic";

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function occupancyStatus(value: unknown): RoomOccupancyStatus | null {
  return typeof value === "string" && ROOM_OCCUPANCY_STATUSES.includes(value as RoomOccupancyStatus)
    ? (value as RoomOccupancyStatus)
    : null;
}

export default async function RoomsPage() {
  const access = await requireHotelAccess();
  const supabase = await createSupabaseServerClient();
  const today = new Date();
  const calendarEnd = new Date(today);
  calendarEnd.setDate(calendarEnd.getDate() + 14);
  const todayDate = today.toISOString().slice(0, 10);
  const calendarEndDate = calendarEnd.toISOString().slice(0, 10);

  const [typesResult, roomsResult, blocksResult, occupancyResult, reservationsResult] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, hotel_id, name, description, default_capacity, default_daily_rate, is_active, created_at, updated_at")
      .eq("hotel_id", access.hotelId)
      .order("name"),
    supabase
      .from("rooms")
      .select("id, hotel_id, room_type_id, number, name, floor, capacity, default_daily_rate, operational_status, notes, created_at, updated_at, room_types(id, name)")
      .eq("hotel_id", access.hotelId)
      .order("number"),
    supabase
      .from("room_blocks")
      .select("id, hotel_id, room_id, block_type, start_at, end_at, reason, notes, status, cancelled_at, created_at, updated_at, rooms!inner(id, number, name)")
      .eq("hotel_id", access.hotelId)
      .order("start_at", { ascending: false })
      .limit(200),
    supabase.from("room_occupancy_view").select("*").eq("hotel_id", access.hotelId),
    supabase
      .from("reservation_rooms")
      .select("id, room_id, checkin_date, checkout_date, blocks_inventory, reservations!inner(code, status, customer_name_snapshot)")
      .eq("hotel_id", access.hotelId)
      .eq("blocks_inventory", true)
      .gte("checkout_date", todayDate)
      .lte("checkin_date", calendarEndDate),
  ]);

  const fatalError = typesResult.error ?? roomsResult.error ?? blocksResult.error;
  if (fatalError) {
    throw new Error("Não foi possível carregar os dados de quartos deste hotel.");
  }

  const roomTypes = (typesResult.data ?? []).map((item) => ({
    ...item,
    default_daily_rate: Number(item.default_daily_rate),
  })) as RoomTypeRow[];
  const rooms = (roomsResult.data ?? []).map((item) => ({
    ...item,
    default_daily_rate: Number(item.default_daily_rate),
    room_types: relation(item.room_types as RoomRow["room_types"] | RoomRow["room_types"][]),
  })) as RoomRow[];
  const blocks = (blocksResult.data ?? []).map((item) => ({
    ...item,
    rooms: relation(item.rooms as RoomBlockRow["rooms"] | RoomBlockRow["rooms"][]),
  })) as RoomBlockRow[];

  const occupancyByRoom: Record<string, RoomOccupancyStatus> = {};
  for (const raw of (occupancyResult.data ?? []) as Record<string, unknown>[]) {
    const roomId = String(raw.room_id ?? raw.id ?? "");
    const status = occupancyStatus(raw.occupancy_status ?? raw.room_status ?? raw.status);
    if (roomId && status) occupancyByRoom[roomId] = status;
  }

  const now = today.getTime();
  for (const room of rooms) {
    if (occupancyByRoom[room.id]) continue;
    if (room.operational_status === "inactive") occupancyByRoom[room.id] = "inactive";
    else if (room.operational_status === "maintenance") occupancyByRoom[room.id] = "maintenance";
    else {
      const activeBlock = blocks.some(
        (block) =>
          block.room_id === room.id &&
          ["scheduled", "active"].includes(block.status) &&
          new Date(block.start_at).getTime() <= now &&
          new Date(block.end_at).getTime() > now,
      );
      occupancyByRoom[room.id] = activeBlock ? "blocked" : "available";
    }
  }

  const calendarEvents: RoomCalendarEvent[] = [];
  for (const block of blocks) {
    if (block.status === "cancelled" || new Date(block.end_at) < today || new Date(block.start_at) > calendarEnd) continue;
    calendarEvents.push({
      id: block.id,
      room_id: block.room_id,
      start_date: block.start_at.slice(0, 10),
      end_date: block.end_at.slice(0, 10),
      kind: "block",
      label: block.reason,
      status: block.status,
    });
  }
  for (const item of (reservationsResult.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const reservation = relation(item.reservations as Record<string, unknown> | Record<string, unknown>[] | null);
    calendarEvents.push({
      id: String(item.id),
      room_id: String(item.room_id),
      start_date: String(item.checkin_date),
      end_date: String(item.checkout_date),
      kind: "reservation",
      label: String(reservation?.code ?? "Reserva"),
      status: String(reservation?.status ?? "confirmed"),
    });
  }

  const warnings: string[] = [];
  if (occupancyResult.error) warnings.push("A visão de ocupação atual não pôde ser consultada; os estados operacionais continuam disponíveis.");
  if (reservationsResult.error) warnings.push("As reservas não puderam ser exibidas no calendário neste momento.");

  return (
    <RoomsModule
      data={{
        hotelId: access.hotelId,
        role: access.role,
        roomTypes,
        rooms,
        blocks,
        occupancyByRoom,
        calendarEvents,
        warnings,
      }}
    />
  );
}
