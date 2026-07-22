import type { HotelRole } from "@/types/auth";

export const RESERVATION_TYPES = ["individual", "company", "group"] as const;
export const RESERVATION_STATUSES = [
  "draft",
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;
export const RESERVATION_SOURCES = [
  "direct",
  "walk_in",
  "phone",
  "whatsapp",
  "website",
  "booking_platform",
  "other",
] as const;
export const CUSTOMER_TYPES = ["person", "company"] as const;
export const DOCUMENT_TYPES = ["cpf", "cnpj", "rg", "passport", "other"] as const;
export const CHARGE_TYPES = ["extra", "service", "fee", "discount", "adjustment"] as const;

export type ReservationType = (typeof RESERVATION_TYPES)[number];
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export type ReservationSource = (typeof RESERVATION_SOURCES)[number];
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type ChargeType = (typeof CHARGE_TYPES)[number];

export interface CustomerRow {
  id: string;
  hotel_id: string;
  customer_type: CustomerType;
  name: string;
  trade_name: string | null;
  document_type: DocumentType | null;
  document: string | null;
  birth_date: string | null;
  nationality: string | null;
  phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  postal_code: string | null;
  street: string | null;
  street_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country_code: string;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  created_at: string;
  updated_at: string;
}

export interface ReservationRoomRow {
  id: string;
  hotel_id: string;
  reservation_id: string;
  room_id: string;
  checkin_date: string;
  checkout_date: string;
  blocks_inventory: boolean;
  room_number_snapshot: string;
  room_type_snapshot: string;
  capacity_snapshot: number;
  guests_count: number;
  daily_rate: number;
  custom_rate: boolean;
  nights: number;
  subtotal_amount: number;
  notes: string | null;
}

export interface ReservationGuestRow {
  id: string;
  hotel_id: string;
  reservation_id: string;
  reservation_room_id: string | null;
  customer_id: string | null;
  name: string;
  document_type: DocumentType | null;
  document: string | null;
  birth_date: string | null;
  phone: string | null;
  is_primary: boolean;
  is_minor: boolean;
  legal_responsible_name: string | null;
  legal_responsible_document: string | null;
  legal_responsible_phone: string | null;
  notes: string | null;
}

export interface ReservationChargeRow {
  id: string;
  hotel_id: string;
  reservation_id: string;
  reservation_room_id: string | null;
  charge_type: ChargeType;
  description: string;
  quantity: number;
  unit_amount: number;
  total_amount: number;
  charge_date: string;
  status: "active" | "void";
  notes: string | null;
  voided_at: string | null;
  created_at: string;
}

export interface PaymentMethodRow {
  id: string;
  code: string;
  name: string;
  method_type: string;
  requires_attachment: boolean;
  is_active: boolean;
  display_order: number;
}

export interface AttachmentRow {
  id: string;
  entity_type: "reservation" | "payment" | "financial_transaction";
  entity_id: string;
  category: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  description: string | null;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  hotel_id: string;
  reservation_id: string;
  payment_method_id: string;
  payment_type: "payment" | "refund";
  original_payment_id: string | null;
  status: "pending" | "confirmed" | "cancelled";
  amount: number;
  paid_at: string;
  external_reference: string | null;
  notes: string | null;
  confirmed_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  payment_methods: Pick<PaymentMethodRow, "id" | "name" | "method_type" | "requires_attachment"> | null;
  attachments: AttachmentRow[];
}

export interface ReservationEventRow {
  id: string;
  reservation_id: string;
  event_type: string;
  source: "system" | "manual" | "backfill";
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ReservationRow {
  id: string;
  hotel_id: string;
  code: string;
  customer_id: string;
  reservation_type: ReservationType;
  status: ReservationStatus;
  checkin_date: string;
  checkout_date: string;
  expected_checkin_at: string | null;
  expected_checkout_at: string | null;
  adults_count: number;
  children_count: number;
  customer_name_snapshot: string;
  customer_document_snapshot: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  origin_city: string | null;
  vehicle_plate: string | null;
  source: ReservationSource;
  customer_notes: string | null;
  internal_notes: string | null;
  confirmation_type: "manual" | "payment" | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  created_at: string;
  updated_at: string;
  customers: Pick<CustomerRow, "id" | "name" | "customer_type" | "phone" | "email" | "document"> | null;
  reservation_rooms: ReservationRoomRow[];
  reservation_guests: ReservationGuestRow[];
  reservation_charges: ReservationChargeRow[];
  payments: PaymentRow[];
  reservation_events: ReservationEventRow[];
  attachments: AttachmentRow[];
}

export interface AvailableRoomRow {
  id: string;
  room_id: string;
  number: string;
  name: string | null;
  room_type_id: string;
  room_type_name: string;
  capacity: number;
  default_daily_rate: number;
  floor: string | null;
}

export interface ReservationsModuleData {
  hotelId: string;
  role: HotelRole;
  hotelName: string;
  reservations: ReservationRow[];
  customers: CustomerRow[];
  rooms: AvailableRoomRow[];
  paymentMethods: PaymentMethodRow[];
  warnings: string[];
}

export interface ReservationActionResult<T = undefined> {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  data?: T;
}

export interface ReservationRoomInput {
  room_id: string;
  guests_count: number;
  daily_rate: number;
  notes?: string;
}

export interface ReservationGuestInput {
  id?: string;
  reservation_room_id?: string | null;
  room_id?: string | null;
  customer_id?: string | null;
  name: string;
  document_type?: DocumentType | null;
  document?: string | null;
  birth_date?: string | null;
  phone?: string | null;
  is_primary: boolean;
  legal_responsible_name?: string | null;
  legal_responsible_document?: string | null;
  legal_responsible_phone?: string | null;
  notes?: string | null;
}
