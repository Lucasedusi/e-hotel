import type { HotelRole } from "@/types/auth";

export const ROOM_OPERATIONAL_STATUSES = [
  "active",
  "maintenance",
  "inactive",
] as const;

export const ROOM_BLOCK_TYPES = [
  "maintenance",
  "cleaning",
  "renovation",
  "internal_use",
  "administrative",
  "other",
] as const;

export const ROOM_BLOCK_STATUSES = [
  "scheduled",
  "active",
  "completed",
  "cancelled",
] as const;

export const ROOM_OCCUPANCY_STATUSES = [
  "available",
  "reserved",
  "occupied",
  "blocked",
  "maintenance",
  "inactive",
] as const;

export type RoomOperationalStatus = (typeof ROOM_OPERATIONAL_STATUSES)[number];
export type RoomBlockType = (typeof ROOM_BLOCK_TYPES)[number];
export type RoomBlockStatus = (typeof ROOM_BLOCK_STATUSES)[number];
export type RoomOccupancyStatus = (typeof ROOM_OCCUPANCY_STATUSES)[number];

export interface RoomTypeRow {
  id: string;
  hotel_id: string;
  name: string;
  description: string | null;
  default_capacity: number;
  default_daily_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomRow {
  id: string;
  hotel_id: string;
  room_type_id: string;
  number: string;
  name: string | null;
  floor: string | null;
  capacity: number;
  default_daily_rate: number;
  operational_status: RoomOperationalStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  room_types: Pick<RoomTypeRow, "id" | "name"> | null;
}

export interface RoomBlockRow {
  id: string;
  hotel_id: string;
  room_id: string;
  block_type: RoomBlockType;
  start_at: string;
  end_at: string;
  reason: string;
  notes: string | null;
  status: RoomBlockStatus;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  rooms: Pick<RoomRow, "id" | "number" | "name"> | null;
}

export interface RoomCalendarEvent {
  id: string;
  room_id: string;
  start_date: string;
  end_date: string;
  kind: "reservation" | "block";
  label: string;
  status: string;
}

export interface RoomsModuleData {
  hotelId: string;
  role: HotelRole;
  roomTypes: RoomTypeRow[];
  rooms: RoomRow[];
  blocks: RoomBlockRow[];
  occupancyByRoom: Record<string, RoomOccupancyStatus>;
  calendarEvents: RoomCalendarEvent[];
  warnings: string[];
}

export interface RoomActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}
