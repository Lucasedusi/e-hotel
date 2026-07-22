import { ReservationsModule } from "@/components/reservations/ReservationsModule";
import { requireHotelAccess } from "@/lib/auth/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AttachmentRow,
  AvailableRoomRow,
  CustomerRow,
  PaymentMethodRow,
  PaymentRow,
  ReservationChargeRow,
  ReservationEventRow,
  ReservationGuestRow,
  ReservationRoomRow,
  ReservationRow,
} from "@/types/reservations";

export const dynamic = "force-dynamic";

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function ReservationsPage() {
  const access = await requireHotelAccess();
  const supabase = await createSupabaseServerClient();
  const activeStatuses = ["draft", "pending", "confirmed", "checked_in"];

  const [reservationsResult, customersResult, roomsResult, methodsResult, eventsResult, attachmentsResult] = await Promise.all([
    supabase
      .from("reservations")
      .select(`
        id, hotel_id, code, customer_id, reservation_type, status, checkin_date, checkout_date,
        expected_checkin_at, expected_checkout_at, adults_count, children_count,
        customer_name_snapshot, customer_document_snapshot, contact_name, contact_phone, contact_email,
        origin_city, vehicle_plate, source, customer_notes, internal_notes, confirmation_type,
        confirmed_at, cancelled_at, cancel_reason, checked_in_at, checked_out_at, created_at, updated_at,
        customers(id, name, customer_type, phone, email, document),
        reservation_rooms(id, hotel_id, reservation_id, room_id, checkin_date, checkout_date, blocks_inventory, room_number_snapshot, room_type_snapshot, capacity_snapshot, guests_count, daily_rate, custom_rate, nights, subtotal_amount, notes),
        reservation_guests(id, hotel_id, reservation_id, reservation_room_id, customer_id, name, document_type, document, birth_date, phone, is_primary, is_minor, legal_responsible_name, legal_responsible_document, legal_responsible_phone, notes),
        reservation_charges(id, hotel_id, reservation_id, reservation_room_id, charge_type, description, quantity, unit_amount, total_amount, charge_date, status, notes, voided_at, created_at),
        payments(id, hotel_id, reservation_id, payment_method_id, payment_type, original_payment_id, status, amount, paid_at, external_reference, notes, confirmed_at, cancel_reason, cancelled_at, created_at, payment_methods(id, name, method_type, requires_attachment))
      `)
      .eq("hotel_id", access.hotelId)
      .in("status", activeStatuses)
      .order("checkin_date", { ascending: true })
      .limit(300),
    supabase
      .from("customers")
      .select("id, hotel_id, customer_type, name, trade_name, document_type, document, birth_date, nationality, phone, secondary_phone, email, contact_name, contact_phone, contact_email, postal_code, street, street_number, address_complement, neighborhood, city, state, country_code, notes, status, created_at, updated_at")
      .eq("hotel_id", access.hotelId)
      .eq("status", "active")
      .order("name")
      .limit(700),
    supabase
      .from("rooms")
      .select("id, number, name, floor, capacity, default_daily_rate, room_type_id, operational_status, room_types(id, name)")
      .eq("hotel_id", access.hotelId)
      .eq("operational_status", "active")
      .order("number"),
    supabase
      .from("payment_methods")
      .select("id, code, name, method_type, requires_attachment, is_active, display_order")
      .eq("hotel_id", access.hotelId)
      .eq("is_active", true)
      .order("display_order")
      .order("name"),
    supabase
      .from("reservation_events")
      .select("id, reservation_id, event_type, source, description, metadata, created_at")
      .eq("hotel_id", access.hotelId)
      .order("created_at", { ascending: false })
      .limit(1500),
    supabase
      .from("attachments")
      .select("id, entity_type, entity_id, category, storage_path, original_name, mime_type, size_bytes, description, created_at")
      .eq("hotel_id", access.hotelId)
      .in("entity_type", ["reservation", "payment"])
      .order("created_at", { ascending: false })
      .limit(1500),
  ]);

  const fatalError = reservationsResult.error ?? customersResult.error ?? roomsResult.error;
  if (fatalError) throw new Error("Não foi possível carregar os dados de reservas deste hotel.");

  const eventsByReservation = new Map<string, ReservationEventRow[]>();
  for (const event of (eventsResult.data ?? []) as ReservationEventRow[]) {
    const current = eventsByReservation.get(event.reservation_id) ?? [];
    current.push(event);
    eventsByReservation.set(event.reservation_id, current);
  }

  const attachmentsByPayment = new Map<string, AttachmentRow[]>();
  const attachmentsByReservation = new Map<string, AttachmentRow[]>();
  for (const attachment of (attachmentsResult.data ?? []) as AttachmentRow[]) {
    if (attachment.entity_type === "payment") {
      const current = attachmentsByPayment.get(attachment.entity_id) ?? [];
      current.push(attachment);
      attachmentsByPayment.set(attachment.entity_id, current);
    } else if (attachment.entity_type === "reservation") {
      const current = attachmentsByReservation.get(attachment.entity_id) ?? [];
      current.push(attachment);
      attachmentsByReservation.set(attachment.entity_id, current);
    }
  }

  const reservations = ((reservationsResult.data ?? []) as unknown as Array<Record<string, unknown>>).map((item) => {
    const payments = ((item.payments ?? []) as Array<Record<string, unknown>>).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
      payment_methods: relation(payment.payment_methods as PaymentRow["payment_methods"] | PaymentRow["payment_methods"][] | null),
      attachments: attachmentsByPayment.get(String(payment.id)) ?? [],
    })) as PaymentRow[];
    return {
      ...item,
      adults_count: Number(item.adults_count),
      children_count: Number(item.children_count),
      customers: relation(item.customers as ReservationRow["customers"] | ReservationRow["customers"][] | null),
      reservation_rooms: ((item.reservation_rooms ?? []) as ReservationRoomRow[]).map((room) => ({ ...room, guests_count: Number(room.guests_count), daily_rate: Number(room.daily_rate), nights: Number(room.nights), subtotal_amount: Number(room.subtotal_amount) })),
      reservation_guests: (item.reservation_guests ?? []) as ReservationGuestRow[],
      reservation_charges: ((item.reservation_charges ?? []) as ReservationChargeRow[]).map((charge) => ({ ...charge, quantity: Number(charge.quantity), unit_amount: Number(charge.unit_amount), total_amount: Number(charge.total_amount) })),
      payments,
      reservation_events: eventsByReservation.get(String(item.id)) ?? [],
      attachments: attachmentsByReservation.get(String(item.id)) ?? [],
    } as ReservationRow;
  });

  const rooms = ((roomsResult.data ?? []) as unknown as Array<Record<string, unknown>>).map((room) => {
    const type = relation(room.room_types as { id: string; name: string } | Array<{ id: string; name: string }> | null);
    return {
      id: String(room.id),
      room_id: String(room.id),
      number: String(room.number),
      name: room.name == null ? null : String(room.name),
      floor: room.floor == null ? null : String(room.floor),
      room_type_id: String(room.room_type_id),
      room_type_name: type?.name ?? "Quarto",
      capacity: Number(room.capacity),
      default_daily_rate: Number(room.default_daily_rate),
    } satisfies AvailableRoomRow;
  });

  const warnings: string[] = [];
  if (methodsResult.error) warnings.push("As formas de pagamento não puderam ser carregadas.");
  if (eventsResult.error) warnings.push("A linha do tempo não pôde ser carregada neste momento.");
  if (attachmentsResult.error) warnings.push("Os comprovantes não puderam ser carregados neste momento.");

  return (
    <ReservationsModule
      data={{
        hotelId: access.hotelId,
        hotelName: access.hotelName,
        role: access.role,
        reservations,
        customers: (customersResult.data ?? []) as CustomerRow[],
        rooms,
        paymentMethods: (methodsResult.data ?? []) as PaymentMethodRow[],
        warnings,
      }}
    />
  );
}
