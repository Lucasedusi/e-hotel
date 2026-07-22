"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BedDouble,
  Building2,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
  LogIn,
  LogOut,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import {
  addReservationNoteAction,
  archiveCustomerAction,
  cancelPaymentAction,
  cancelReservationAction,
  checkInReservationAction,
  checkOutReservationAction,
  confirmPaymentAction,
  confirmReservationAction,
  getAttachmentUrlAction,
  getAvailableRoomsAction,
  markNoShowAction,
  refundPaymentAction,
  saveChargeAction,
  saveCustomerAction,
  savePaymentAction,
  saveReservationAction,
  uploadReservationAttachmentAction,
  voidChargeAction,
} from "@/app/(dashboard)/reservas/actions";
import type {
  AvailableRoomRow,
  CustomerRow,
  PaymentRow,
  ReservationActionResult,
  ReservationGuestInput,
  ReservationRoomInput,
  ReservationRow,
  ReservationsModuleData,
} from "@/types/reservations";

type MainTab = "reservations" | "customers";
type DetailsTab = "overview" | "guests" | "finance" | "timeline";
type Tone = "primary" | "success" | "warning" | "danger" | "purple" | "neutral";
type Operation =
  | "confirm"
  | "checkin"
  | "checkout"
  | "cancel"
  | "no-show"
  | "cancel-payment"
  | "void-charge"
  | "archive-customer";
type ModalState =
  | { kind: "reservation"; value?: ReservationRow }
  | { kind: "customer"; value?: CustomerRow }
  | { kind: "details"; value: ReservationRow; tab?: DetailsTab }
  | { kind: "charge"; value: ReservationRow }
  | { kind: "payment"; value: ReservationRow }
  | { kind: "refund"; value: ReservationRow; payment: PaymentRow }
  | { kind: "document"; value: ReservationRow }
  | {
      kind: "operation";
      value?: ReservationRow;
      customer?: CustomerRow;
      payment?: PaymentRow;
      chargeId?: string;
      operation: Operation;
    };

const statusMeta: Record<
  ReservationRow["status"],
  { label: string; tone: Tone }
> = {
  draft: { label: "Rascunho", tone: "neutral" },
  pending: { label: "Pendente", tone: "warning" },
  confirmed: { label: "Confirmada", tone: "success" },
  checked_in: { label: "Hospedado", tone: "primary" },
  checked_out: { label: "Finalizada", tone: "neutral" },
  cancelled: { label: "Cancelada", tone: "danger" },
  no_show: { label: "Não compareceu", tone: "danger" },
};
const typeLabels = {
  individual: "Individual",
  company: "Empresarial",
  group: "Grupo",
} as const;
const sourceLabels = {
  direct: "Direto",
  walk_in: "Balcão",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  website: "Site",
  booking_platform: "Plataforma",
  other: "Outro",
} as const;
const chargeLabels = {
  extra: "Extra",
  service: "Serviço",
  fee: "Taxa",
  discount: "Desconto",
  adjustment: "Ajuste",
} as const;
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}
function formatDate(value: string) {
  return shortDate.format(parseDate(value));
}
function todayKey() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}
function nightsBetween(start: string, end: string) {
  return Math.max(
    0,
    Math.round(
      (parseDate(end).getTime() - parseDate(start).getTime()) / 86400000,
    ),
  );
}
function normalize(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
function accommodationTotal(reservation: ReservationRow) {
  return reservation.reservation_rooms.reduce(
    (sum, room) => sum + Number(room.subtotal_amount),
    0,
  );
}
function chargesTotal(reservation: ReservationRow) {
  return reservation.reservation_charges
    .filter((charge) => charge.status === "active")
    .reduce((sum, charge) => sum + Number(charge.total_amount), 0);
}
function paidTotal(reservation: ReservationRow) {
  return reservation.payments
    .filter((payment) => payment.status === "confirmed")
    .reduce(
      (sum, payment) =>
        sum +
        (payment.payment_type === "refund"
          ? -Number(payment.amount)
          : Number(payment.amount)),
      0,
    );
}
function reservationTotal(reservation: ReservationRow) {
  return accommodationTotal(reservation) + chargesTotal(reservation);
}
function roomLabel(room: Pick<AvailableRoomRow, "number" | "name">) {
  return room.name ? `${room.number} · ${room.name}` : `Quarto ${room.number}`;
}

export function ReservationsModule({ data }: { data: ReservationsModuleData }) {
  const router = useRouter();
  const [tab, setTab] = useState<MainTab>("reservations");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const canOperate = ["owner", "admin", "reception"].includes(data.role);
  const canFinance = canOperate || data.role === "finance";
  const today = todayKey();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(
    () => ({
      active: data.reservations.length,
      arrivals: data.reservations.filter(
        (item) =>
          item.checkin_date === today &&
          ["pending", "confirmed"].includes(item.status),
      ).length,
      departures: data.reservations.filter(
        (item) => item.checkout_date === today && item.status === "checked_in",
      ).length,
      occupied: data.reservations.filter((item) => item.status === "checked_in")
        .length,
    }),
    [data.reservations, today],
  );

  const filteredReservations = useMemo(() => {
    const term = normalize(search);
    return data.reservations.filter((reservation) => {
      const rooms = reservation.reservation_rooms
        .map((room) => room.room_number_snapshot)
        .join(" ");
      const searchable = normalize(
        `${reservation.code} ${reservation.customer_name_snapshot} ${reservation.contact_phone ?? ""} ${rooms}`,
      );
      const periodMatches =
        periodFilter === "all" ||
        (periodFilter === "today" &&
          reservation.checkin_date <= today &&
          reservation.checkout_date >= today) ||
        (periodFilter === "arrivals" && reservation.checkin_date === today) ||
        (periodFilter === "departures" && reservation.checkout_date === today);
      return (
        (!term || searchable.includes(term)) &&
        (statusFilter === "all" || reservation.status === statusFilter) &&
        periodMatches
      );
    });
  }, [data.reservations, periodFilter, search, statusFilter, today]);

  const filteredCustomers = useMemo(() => {
    const term = normalize(search);
    return data.customers.filter(
      (customer) =>
        !term ||
        normalize(
          `${customer.name} ${customer.trade_name ?? ""} ${customer.document ?? ""} ${customer.phone ?? ""} ${customer.email ?? ""}`,
        ).includes(term),
    );
  }, [data.customers, search]);

  function onResult(
    result: ReservationActionResult<unknown>,
    keepOpen = false,
  ) {
    setToast({ ok: result.ok, message: result.message });
    if (result.ok) {
      if (!keepOpen) setModal(null);
      router.refresh();
    }
  }

  return (
    <Page>
      <PageHeader>
        <div>
          <Eyebrow>
            <CalendarCheck size={15} /> Reservas e hospedagem
          </Eyebrow>
          <h2>Operação de reservas</h2>
          <p>
            Gerencie clientes, disponibilidade, hospedagens, cobranças e
            pagamentos em um único fluxo.
          </p>
        </div>
        {canOperate && (
          <PrimaryButton
            type="button"
            onClick={() => setModal({ kind: "reservation" })}
          >
            <Plus size={17} /> Nova reserva
          </PrimaryButton>
        )}
      </PageHeader>

      {data.warnings.map((warning) => (
        <Warning key={warning}>
          <AlertCircle size={17} />
          {warning}
        </Warning>
      ))}

      <StatsGrid>
        <Stat
          icon={<CalendarDays size={20} />}
          label="Reservas ativas"
          value={stats.active}
          hint="Em operação"
          tone="primary"
        />
        <Stat
          icon={<LogIn size={20} />}
          label="Entradas hoje"
          value={stats.arrivals}
          hint="Aguardando chegada"
          tone="success"
        />
        <Stat
          icon={<LogOut size={20} />}
          label="Saídas hoje"
          value={stats.departures}
          hint="Check-outs previstos"
          tone="warning"
        />
        <Stat
          icon={<BedDouble size={20} />}
          label="Hospedagens"
          value={stats.occupied}
          hint="Check-in realizado"
          tone="purple"
        />
      </StatsGrid>

      <Panel>
        <Tabs>
          <TabButton
            type="button"
            $active={tab === "reservations"}
            onClick={() => {
              setTab("reservations");
              setSearch("");
            }}
          >
            <CalendarCheck size={16} /> Reservas{" "}
            <Count>{data.reservations.length}</Count>
          </TabButton>
          <TabButton
            type="button"
            $active={tab === "customers"}
            onClick={() => {
              setTab("customers");
              setSearch("");
            }}
          >
            <Users size={16} /> Clientes <Count>{data.customers.length}</Count>
          </TabButton>
        </Tabs>
        <Section>
          <Toolbar $customers={tab === "customers"}>
            <SearchBox>
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  tab === "reservations"
                    ? "Buscar por código, cliente, telefone ou quarto..."
                    : "Buscar cliente por nome, documento ou contato..."
                }
              />
              {search && (
                <ClearButton type="button" onClick={() => setSearch("")}>
                  <X size={15} />
                </ClearButton>
              )}
            </SearchBox>
            {tab === "reservations" ? (
              <>
                <FilterBox>
                  <Filter size={14} />
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="all">Todas as situações</option>
                    <option value="draft">Rascunhos</option>
                    <option value="pending">Pendentes</option>
                    <option value="confirmed">Confirmadas</option>
                    <option value="checked_in">Hospedados</option>
                  </select>
                  <ChevronDown size={13} />
                </FilterBox>
                <FilterBox>
                  <CalendarDays size={14} />
                  <select
                    value={periodFilter}
                    onChange={(event) => setPeriodFilter(event.target.value)}
                  >
                    <option value="all">Todos os períodos</option>
                    <option value="today">Em andamento hoje</option>
                    <option value="arrivals">Entradas hoje</option>
                    <option value="departures">Saídas hoje</option>
                  </select>
                  <ChevronDown size={13} />
                </FilterBox>
              </>
            ) : (
              canOperate && (
                <SecondaryButton
                  type="button"
                  onClick={() => setModal({ kind: "customer" })}
                >
                  <UserPlus size={16} /> Novo cliente
                </SecondaryButton>
              )
            )}
          </Toolbar>

          {tab === "reservations" ? (
            filteredReservations.length ? (
              <ReservationList
                reservations={filteredReservations}
                canOperate={canOperate}
                canFinance={canFinance}
                onModal={setModal}
              />
            ) : (
              <Empty
                icon={<CalendarCheck size={28} />}
                title="Nenhuma reserva encontrada"
                description={
                  data.reservations.length
                    ? "Ajuste a busca ou os filtros para visualizar outras reservas."
                    : "Crie a primeira reserva para iniciar a operação deste hotel."
                }
                action={
                  canOperate && !data.reservations.length ? (
                    <PrimaryButton
                      type="button"
                      onClick={() => setModal({ kind: "reservation" })}
                    >
                      <Plus size={16} /> Criar reserva
                    </PrimaryButton>
                  ) : undefined
                }
              />
            )
          ) : filteredCustomers.length ? (
            <CustomersGrid>
              {filteredCustomers.map((customer) => (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  canManage={canOperate}
                  onModal={setModal}
                />
              ))}
            </CustomersGrid>
          ) : (
            <Empty
              icon={<Users size={28} />}
              title="Nenhum cliente encontrado"
              description="Cadastre pessoas e empresas para utilizá-las nas reservas."
              action={
                canOperate ? (
                  <PrimaryButton
                    type="button"
                    onClick={() => setModal({ kind: "customer" })}
                  >
                    <UserPlus size={16} /> Cadastrar cliente
                  </PrimaryButton>
                ) : undefined
              }
            />
          )}
        </Section>
      </Panel>

      {modal && (
        <Modal
          modal={modal}
          data={data}
          canOperate={canOperate}
          canFinance={canFinance}
          onClose={() => setModal(null)}
          onModal={setModal}
          onResult={onResult}
        />
      )}
      {toast && (
        <Toast $ok={toast.ok}>
          <span>
            {toast.ok ? <Check size={17} /> : <AlertCircle size={17} />}
          </span>
          <p>{toast.message}</p>
          <button type="button" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </Toast>
      )}
    </Page>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  tone: Tone;
}) {
  return (
    <StatCard>
      <StatIcon $tone={tone}>{icon}</StatIcon>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </StatCard>
  );
}

function ReservationList({
  reservations,
  canOperate,
  canFinance,
  onModal,
}: {
  reservations: ReservationRow[];
  canOperate: boolean;
  canFinance: boolean;
  onModal: (modal: ModalState) => void;
}) {
  return (
    <ReservationCards>
      {reservations.map((reservation) => {
        const total = reservationTotal(reservation);
        const paid = paidTotal(reservation);
        const balance = total - paid;
        const meta = statusMeta[reservation.status];
        return (
          <ReservationCard key={reservation.id}>
            <CardTop>
              <div>
                <Code>{reservation.code}</Code>
                <StatusBadge $tone={meta.tone}>
                  <i />
                  {meta.label}
                </StatusBadge>
              </div>
              <Actions>
                <IconButton
                  type="button"
                  title="Ver detalhes"
                  onClick={() =>
                    onModal({ kind: "details", value: reservation })
                  }
                >
                  <Eye size={15} />
                </IconButton>
                {(canOperate || canFinance) && (
                  <ActionMenu
                    reservation={reservation}
                    canOperate={canOperate}
                    canFinance={canFinance}
                    onModal={onModal}
                  />
                )}
              </Actions>
            </CardTop>
            <GuestName>{reservation.customer_name_snapshot}</GuestName>
            <ReservationKind>
              {typeLabels[reservation.reservation_type]} ·{" "}
              {sourceLabels[reservation.source]}
            </ReservationKind>
            <StayBox>
              <StayDate>
                <small>Entrada</small>
                <strong>{formatDate(reservation.checkin_date)}</strong>
              </StayDate>
              <StayArrow>
                <ArrowRight size={16} />
                <span>
                  {nightsBetween(
                    reservation.checkin_date,
                    reservation.checkout_date,
                  )}{" "}
                  diária(s)
                </span>
              </StayArrow>
              <StayDate>
                <small>Saída</small>
                <strong>{formatDate(reservation.checkout_date)}</strong>
              </StayDate>
            </StayBox>
            <RoomChips>
              {reservation.reservation_rooms.map((room) => (
                <span key={room.id}>
                  <BedDouble size={12} /> {room.room_number_snapshot}
                </span>
              ))}
            </RoomChips>
            <CardMetrics>
              <span>
                <Users size={13} />{" "}
                {reservation.adults_count + reservation.children_count}{" "}
                hóspede(s)
              </span>
              <span>
                <CircleDollarSign size={13} /> {currency.format(total)}
              </span>
            </CardMetrics>
            <Balance $settled={balance <= 0}>
              <span>{balance <= 0 ? "Quitado" : "Saldo em aberto"}</span>
              <strong>{currency.format(Math.max(0, balance))}</strong>
            </Balance>
            <CardFooter>
              <GhostButton
                type="button"
                onClick={() => onModal({ kind: "details", value: reservation })}
              >
                <Eye size={14} /> Ver reserva
              </GhostButton>
              {reservation.status === "confirmed" && canOperate && (
                <PrimaryMini
                  type="button"
                  onClick={() =>
                    onModal({
                      kind: "operation",
                      value: reservation,
                      operation: "checkin",
                    })
                  }
                >
                  <LogIn size={14} /> Check-in
                </PrimaryMini>
              )}
              {reservation.status === "checked_in" && canOperate && (
                <PrimaryMini
                  type="button"
                  onClick={() =>
                    onModal({
                      kind: "operation",
                      value: reservation,
                      operation: "checkout",
                    })
                  }
                >
                  <LogOut size={14} /> Check-out
                </PrimaryMini>
              )}
            </CardFooter>
          </ReservationCard>
        );
      })}
    </ReservationCards>
  );
}

function ActionMenu({
  reservation,
  canOperate,
  canFinance,
  onModal,
}: {
  reservation: ReservationRow;
  canOperate: boolean;
  canFinance: boolean;
  onModal: (modal: ModalState) => void;
}) {
  return (
    <Menu>
      <MenuButton type="button" aria-label="Mais ações">
        <MoreHorizontal size={16} />
      </MenuButton>
      <MenuPopover>
        {canOperate &&
          !["checked_out", "cancelled", "no_show"].includes(
            reservation.status,
          ) && (
            <button
              type="button"
              onClick={() =>
                onModal({ kind: "reservation", value: reservation })
              }
            >
              <Edit3 size={14} /> Editar
            </button>
          )}
        {canFinance &&
          !["draft", "cancelled", "no_show"].includes(reservation.status) && (
            <button
              type="button"
              onClick={() => onModal({ kind: "payment", value: reservation })}
            >
              <CreditCard size={14} /> Pagamento
            </button>
          )}
        {canFinance &&
          !["checked_out", "cancelled", "no_show"].includes(
            reservation.status,
          ) && (
            <button
              type="button"
              onClick={() => onModal({ kind: "charge", value: reservation })}
            >
              <Plus size={14} /> Cobrança
            </button>
          )}
        {canOperate && reservation.status === "pending" && (
          <button
            type="button"
            onClick={() =>
              onModal({
                kind: "operation",
                value: reservation,
                operation: "confirm",
              })
            }
          >
            <BadgeCheck size={14} /> Confirmar
          </button>
        )}
        {canOperate &&
          ["pending", "confirmed"].includes(reservation.status) && (
            <button
              type="button"
              onClick={() =>
                onModal({
                  kind: "operation",
                  value: reservation,
                  operation: "no-show",
                })
              }
            >
              <ShieldAlert size={14} /> Não compareceu
            </button>
          )}
        {canOperate &&
          ["draft", "pending", "confirmed"].includes(reservation.status) && (
            <button
              className="danger"
              type="button"
              onClick={() =>
                onModal({
                  kind: "operation",
                  value: reservation,
                  operation: "cancel",
                })
              }
            >
              <XCircle size={14} /> Cancelar reserva
            </button>
          )}
      </MenuPopover>
    </Menu>
  );
}

function CustomerCard({
  customer,
  canManage,
  onModal,
}: {
  customer: CustomerRow;
  canManage: boolean;
  onModal: (modal: ModalState) => void;
}) {
  return (
    <CustomerBox>
      <CustomerTop>
        <CustomerAvatar>
          {customer.customer_type === "company" ? (
            <Building2 size={18} />
          ) : (
            customer.name.slice(0, 2).toUpperCase()
          )}
        </CustomerAvatar>
        <StatusBadge
          $tone={customer.customer_type === "company" ? "purple" : "primary"}
        >
          {customer.customer_type === "company" ? "Empresa" : "Pessoa"}
        </StatusBadge>
      </CustomerTop>
      <h3>{customer.name}</h3>
      {customer.trade_name && <small>{customer.trade_name}</small>}
      <CustomerInfo>
        <span>{customer.document || "Documento não informado"}</span>
        <span>
          {customer.phone || customer.contact_phone || "Telefone não informado"}
        </span>
        <span>
          {customer.email || customer.contact_email || "E-mail não informado"}
        </span>
      </CustomerInfo>
      {canManage && (
        <CustomerActions>
          <GhostButton
            type="button"
            onClick={() => onModal({ kind: "customer", value: customer })}
          >
            <Edit3 size={14} /> Editar
          </GhostButton>
          <IconDanger
            type="button"
            title="Arquivar cliente"
            onClick={() =>
              onModal({
                kind: "operation",
                customer,
                operation: "archive-customer",
              })
            }
          >
            <Trash2 size={14} />
          </IconDanger>
        </CustomerActions>
      )}
    </CustomerBox>
  );
}

function Modal({
  modal,
  data,
  canOperate,
  canFinance,
  onClose,
  onModal,
  onResult,
}: {
  modal: ModalState;
  data: ReservationsModuleData;
  canOperate: boolean;
  canFinance: boolean;
  onClose: () => void;
  onModal: (modal: ModalState) => void;
  onResult: (
    result: ReservationActionResult<unknown>,
    keepOpen?: boolean,
  ) => void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  const wide = modal.kind === "reservation" || modal.kind === "details";
  return (
    <ModalOverlay
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Dialog $wide={wide}>
        {modal.kind === "reservation" && (
          <ReservationForm
            value={modal.value}
            data={data}
            onClose={onClose}
            onResult={onResult}
          />
        )}
        {modal.kind === "customer" && (
          <CustomerForm
            value={modal.value}
            onClose={onClose}
            onResult={onResult}
          />
        )}
        {modal.kind === "details" && (
          <ReservationDetails
            value={modal.value}
            initialTab={modal.tab}
            canOperate={canOperate}
            canFinance={canFinance}
            onClose={onClose}
            onModal={onModal}
            onResult={onResult}
          />
        )}
        {modal.kind === "charge" && (
          <ChargeForm
            value={modal.value}
            onClose={onClose}
            onResult={onResult}
          />
        )}
        {modal.kind === "payment" && (
          <PaymentForm
            value={modal.value}
            methods={data.paymentMethods}
            onClose={onClose}
            onResult={onResult}
          />
        )}
        {modal.kind === "refund" && (
          <RefundForm
            value={modal.value}
            payment={modal.payment}
            onClose={onClose}
            onResult={onResult}
          />
        )}
        {modal.kind === "document" && (
          <DocumentForm
            value={modal.value}
            onClose={onClose}
            onResult={onResult}
          />
        )}
        {modal.kind === "operation" && (
          <OperationDialog
            modal={modal}
            onClose={onClose}
            onResult={onResult}
          />
        )}
      </Dialog>
    </ModalOverlay>
  );
}

function ModalTitle({
  icon,
  title,
  description,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <ModalHeader>
      <div>
        <ModalEyebrow>{icon}</ModalEyebrow>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <ModalClose type="button" onClick={onClose}>
        <X size={17} />
      </ModalClose>
    </ModalHeader>
  );
}

interface ReservationDraft {
  customer_id: string;
  reservation_type: "individual" | "company" | "group";
  checkin_date: string;
  checkout_date: string;
  adults_count: number;
  children_count: number;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  origin_city: string;
  vehicle_plate: string;
  source: ReservationRow["source"];
  customer_notes: string;
  internal_notes: string;
}
type GuestDraft = ReservationGuestInput & { key: string };

function ReservationForm({
  value,
  data,
  onClose,
  onResult,
}: {
  value?: ReservationRow;
  data: ReservationsModuleData;
  onClose: () => void;
  onResult: (result: ReservationActionResult<unknown>) => void;
}) {
  const initialCheckin = value?.checkin_date ?? todayKey();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ReservationDraft>({
    customer_id: value?.customer_id ?? "",
    reservation_type: value?.reservation_type ?? "individual",
    checkin_date: initialCheckin,
    checkout_date: value?.checkout_date ?? addDays(initialCheckin, 1),
    adults_count: value?.adults_count ?? 1,
    children_count: value?.children_count ?? 0,
    contact_name: value?.contact_name ?? "",
    contact_phone: value?.contact_phone ?? "",
    contact_email: value?.contact_email ?? "",
    origin_city: value?.origin_city ?? "",
    vehicle_plate: value?.vehicle_plate ?? "",
    source: value?.source ?? "direct",
    customer_notes: value?.customer_notes ?? "",
    internal_notes: value?.internal_notes ?? "",
  });
  const [rooms, setRooms] = useState<ReservationRoomInput[]>(
    value?.reservation_rooms.map((room) => ({
      room_id: room.room_id,
      guests_count: room.guests_count,
      daily_rate: room.daily_rate,
      notes: room.notes ?? "",
    })) ?? [],
  );
  const [availableRooms, setAvailableRooms] = useState<AvailableRoomRow[]>(
    data.rooms,
  );
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [guests, setGuests] = useState<GuestDraft[]>(
    value?.reservation_guests.map((guest) => ({
      ...guest,
      room_id:
        value.reservation_rooms.find(
          (room) => room.id === guest.reservation_room_id,
        )?.room_id ?? null,
      key: guest.id,
    })) ?? [],
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedCustomer = data.customers.find(
    (customer) => customer.id === draft.customer_id,
  );
  const allSelectableRooms = useMemo(() => {
    const currentIds = new Set(rooms.map((room) => room.room_id));
    const current = data.rooms.filter((room) => currentIds.has(room.room_id));
    return [
      ...availableRooms,
      ...current.filter(
        (room) =>
          !availableRooms.some(
            (available) => available.room_id === room.room_id,
          ),
      ),
    ];
  }, [availableRooms, data.rooms, rooms]);
  const selectedCapacity = rooms.reduce(
    (sum, selected) =>
      sum +
      (data.rooms.find((room) => room.room_id === selected.room_id)?.capacity ??
        0),
    0,
  );
  const totalGuests = draft.adults_count + draft.children_count;
  const estimated = rooms.reduce(
    (sum, room) =>
      sum +
      Number(room.daily_rate) *
        nightsBetween(draft.checkin_date, draft.checkout_date),
    0,
  );

  function updateDraft<K extends keyof ReservationDraft>(
    key: K,
    newValue: ReservationDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: newValue }));
  }
  function chooseCustomer(id: string) {
    const customer = data.customers.find((item) => item.id === id);
    setDraft((current) => ({
      ...current,
      customer_id: id,
      reservation_type:
        customer?.customer_type === "company"
          ? "company"
          : current.reservation_type === "company"
            ? "individual"
            : current.reservation_type,
      contact_name:
        customer?.contact_name || customer?.name || current.contact_name,
      contact_phone:
        customer?.contact_phone || customer?.phone || current.contact_phone,
      contact_email:
        customer?.contact_email || customer?.email || current.contact_email,
    }));
    if (!guests.length && customer)
      setGuests([
        {
          key: crypto.randomUUID(),
          room_id: rooms[0]?.room_id ?? null,
          customer_id: customer.id,
          name: customer.name,
          document_type: customer.document_type,
          document: customer.document,
          birth_date: customer.birth_date,
          phone: customer.phone,
          is_primary: true,
        },
      ]);
  }
  function next() {
    setError("");
    if (
      step === 1 &&
      (!draft.customer_id ||
        draft.checkout_date <= draft.checkin_date ||
        totalGuests < 1)
    ) {
      setError("Selecione o cliente e informe um período e ocupação válidos.");
      return;
    }
    if (step === 2 && rooms.length === 0) {
      setError("Selecione ao menos um quarto para continuar.");
      return;
    }
    if (step === 2 && selectedCapacity < totalGuests) {
      setError(
        "A capacidade dos quartos selecionados é menor que a quantidade de hóspedes.",
      );
      return;
    }
    if (step === 3 && guests.some((guest) => guest.name.trim().length < 2)) {
      setError("Informe o nome de todos os hóspedes adicionados.");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }
  function searchAvailability() {
    setError("");
    setAvailabilityMessage("Consultando disponibilidade...");
    startTransition(async () => {
      const result = await getAvailableRoomsAction({
        checkinDate: draft.checkin_date,
        checkoutDate: draft.checkout_date,
        minCapacity: 1,
        excludeReservationId: value?.id,
      });
      if (result.ok) {
        setAvailableRooms(result.data ?? []);
        setAvailabilityMessage(result.message);
      } else {
        setAvailabilityMessage("");
        setError(result.message);
      }
    });
  }
  function toggleRoom(room: AvailableRoomRow) {
    setRooms((current) =>
      current.some((item) => item.room_id === room.room_id)
        ? current.filter((item) => item.room_id !== room.room_id)
        : [
            ...current,
            {
              room_id: room.room_id,
              guests_count: 1,
              daily_rate: room.default_daily_rate,
              notes: "",
            },
          ],
    );
  }
  function updateRoom(
    id: string,
    key: "guests_count" | "daily_rate" | "notes",
    newValue: string | number,
  ) {
    setRooms((current) =>
      current.map((room) =>
        room.room_id === id
          ? { ...room, [key]: key === "notes" ? newValue : Number(newValue) }
          : room,
      ),
    );
  }
  function addGuest() {
    setGuests((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        room_id: rooms[0]?.room_id ?? null,
        name: "",
        is_primary: current.length === 0,
      },
    ]);
  }
  function updateGuest(
    key: string,
    field: keyof ReservationGuestInput,
    newValue: string | boolean | null,
  ) {
    setGuests((current) =>
      current.map((guest) =>
        guest.key === key
          ? { ...guest, [field]: newValue }
          : field === "is_primary" && newValue
            ? { ...guest, is_primary: false }
            : guest,
      ),
    );
  }
  function submit(status: "draft" | "pending") {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      if (value) formData.set("id", value.id);
      Object.entries(draft).forEach(([key, item]) =>
        formData.set(key, String(item ?? "")),
      );
      formData.set("submit_status", status);
      formData.set("rooms_json", JSON.stringify(rooms));
      formData.set("guests_json", JSON.stringify(guests));
      const result = await saveReservationAction(formData);
      if (!result.ok) setError(result.message);
      onResult(result);
    });
  }

  return (
    <>
      <ModalTitle
        icon={<CalendarCheck size={16} />}
        title={value ? `Editar ${value.code}` : "Nova reserva"}
        description="Fluxo completo de cliente, disponibilidade, hóspedes e conferência."
        onClose={onClose}
      />
      <Progress>
        <ProgressLine>
          <i style={{ width: `${((step - 1) / 3) * 100}%` }} />
        </ProgressLine>
        {["Dados", "Quartos", "Hóspedes", "Revisão"].map((label, index) => (
          <ProgressStep key={label} $active={step >= index + 1}>
            <span>{step > index + 1 ? <Check size={12} /> : index + 1}</span>
            <small>{label}</small>
          </ProgressStep>
        ))}
      </Progress>
      <ModalBody>
        {error && (
          <InlineError>
            <AlertCircle size={15} />
            {error}
          </InlineError>
        )}
        {step === 1 && (
          <FormGrid>
            <Field $full>
              <label>Cliente responsável *</label>
              <select
                value={draft.customer_id}
                onChange={(event) => chooseCustomer(event.target.value)}
              >
                <option value="">Selecione uma pessoa ou empresa</option>
                {data.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ·{" "}
                    {customer.customer_type === "company"
                      ? "Empresa"
                      : "Pessoa"}
                  </option>
                ))}
              </select>
              <FieldHint>
                Cadastre um novo cliente na aba Clientes, se necessário.
              </FieldHint>
            </Field>
            <Field>
              <label>Tipo da reserva *</label>
              <select
                value={draft.reservation_type}
                onChange={(event) =>
                  updateDraft(
                    "reservation_type",
                    event.target.value as ReservationDraft["reservation_type"],
                  )
                }
              >
                <option value="individual">Individual</option>
                <option value="company">Empresarial</option>
                <option value="group">Grupo</option>
              </select>
            </Field>
            <Field>
              <label>Origem *</label>
              <select
                value={draft.source}
                onChange={(event) =>
                  updateDraft(
                    "source",
                    event.target.value as ReservationRow["source"],
                  )
                }
              >
                {Object.entries(sourceLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <label>Entrada *</label>
              <input
                type="date"
                min={todayKey()}
                value={draft.checkin_date}
                onChange={(event) => {
                  updateDraft("checkin_date", event.target.value);
                  if (event.target.value >= draft.checkout_date)
                    updateDraft(
                      "checkout_date",
                      addDays(event.target.value, 1),
                    );
                }}
              />
            </Field>
            <Field>
              <label>Saída *</label>
              <input
                type="date"
                min={addDays(draft.checkin_date, 1)}
                value={draft.checkout_date}
                onChange={(event) =>
                  updateDraft("checkout_date", event.target.value)
                }
              />
            </Field>
            <Field>
              <label>Adultos *</label>
              <input
                type="number"
                min="0"
                value={draft.adults_count}
                onChange={(event) =>
                  updateDraft("adults_count", Number(event.target.value))
                }
              />
            </Field>
            <Field>
              <label>Crianças</label>
              <input
                type="number"
                min="0"
                value={draft.children_count}
                onChange={(event) =>
                  updateDraft("children_count", Number(event.target.value))
                }
              />
            </Field>
            <Field>
              <label>Contato</label>
              <input
                value={draft.contact_name}
                onChange={(event) =>
                  updateDraft("contact_name", event.target.value)
                }
              />
            </Field>
            <Field>
              <label>Telefone</label>
              <input
                value={draft.contact_phone}
                onChange={(event) =>
                  updateDraft("contact_phone", event.target.value)
                }
              />
            </Field>
            <Field>
              <label>E-mail</label>
              <input
                type="email"
                value={draft.contact_email}
                onChange={(event) =>
                  updateDraft("contact_email", event.target.value)
                }
              />
            </Field>
            <Field>
              <label>Cidade de origem</label>
              <input
                value={draft.origin_city}
                onChange={(event) =>
                  updateDraft("origin_city", event.target.value)
                }
              />
            </Field>
            <Field>
              <label>Placa do veículo</label>
              <input
                value={draft.vehicle_plate}
                onChange={(event) =>
                  updateDraft("vehicle_plate", event.target.value.toUpperCase())
                }
              />
            </Field>
          </FormGrid>
        )}
        {step === 2 && (
          <StepContent>
            <AvailabilityBar>
              <div>
                <CalendarDays size={18} />
                <span>
                  <strong>
                    {formatDate(draft.checkin_date)} →{" "}
                    {formatDate(draft.checkout_date)}
                  </strong>
                  <small>
                    {nightsBetween(draft.checkin_date, draft.checkout_date)}{" "}
                    diária(s) · {totalGuests} hóspede(s)
                  </small>
                </span>
              </div>
              <SecondaryButton
                type="button"
                disabled={isPending}
                onClick={searchAvailability}
              >
                <RefreshCw size={15} />{" "}
                {isPending ? "Consultando..." : "Buscar disponibilidade"}
              </SecondaryButton>
            </AvailabilityBar>
            {availabilityMessage && (
              <SuccessLine>
                <CheckCircle2 size={15} />
                {availabilityMessage}
              </SuccessLine>
            )}
            <RoomSelector>
              {allSelectableRooms.map((room) => {
                const selected = rooms.find(
                  (item) => item.room_id === room.room_id,
                );
                return (
                  <SelectableRoom
                    key={room.room_id}
                    $selected={Boolean(selected)}
                  >
                    <button type="button" onClick={() => toggleRoom(room)}>
                      <span>
                        <BedDouble size={17} />
                      </span>
                      <div>
                        <strong>{roomLabel(room)}</strong>
                        <small>
                          {room.room_type_name} · até {room.capacity} pessoa(s)
                        </small>
                      </div>
                      <b>{currency.format(room.default_daily_rate)}</b>
                      {selected ? (
                        <CheckCircle2 size={18} />
                      ) : (
                        <Plus size={18} />
                      )}
                    </button>
                    {selected && (
                      <RoomConfig>
                        <label>
                          Hóspedes
                          <input
                            type="number"
                            min="1"
                            max={room.capacity}
                            value={selected.guests_count}
                            onChange={(event) =>
                              updateRoom(
                                room.room_id,
                                "guests_count",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          Diária (R$)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={selected.daily_rate}
                            onChange={(event) =>
                              updateRoom(
                                room.room_id,
                                "daily_rate",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          Observação
                          <input
                            value={selected.notes ?? ""}
                            onChange={(event) =>
                              updateRoom(
                                room.room_id,
                                "notes",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      </RoomConfig>
                    )}
                  </SelectableRoom>
                );
              })}
            </RoomSelector>
            {!allSelectableRooms.length && (
              <MiniEmpty>
                <BedDouble size={24} />
                <strong>Nenhum quarto disponível</strong>
                <span>Altere o período ou consulte novamente.</span>
              </MiniEmpty>
            )}
          </StepContent>
        )}
        {step === 3 && (
          <StepContent>
            <SectionHeading>
              <div>
                <h3>Hóspedes da reserva</h3>
                <p>
                  Distribua os integrantes nos quartos e identifique o
                  responsável principal.
                </p>
              </div>
              <SecondaryButton type="button" onClick={addGuest}>
                <UserPlus size={15} /> Adicionar hóspede
              </SecondaryButton>
            </SectionHeading>
            {!guests.length && (
              <InfoBox>
                <AlertCircle size={15} />O cadastro nominal pode ser concluído
                depois, antes do check-in.
              </InfoBox>
            )}
            <GuestList>
              {guests.map((guest, index) => (
                <GuestBox key={guest.key}>
                  <GuestHeader>
                    <strong>Hóspede {index + 1}</strong>
                    <div>
                      <label>
                        <input
                          type="radio"
                          name="primary"
                          checked={guest.is_primary}
                          onChange={() =>
                            updateGuest(guest.key, "is_primary", true)
                          }
                        />{" "}
                        Principal
                      </label>
                      <IconDanger
                        type="button"
                        onClick={() =>
                          setGuests((current) =>
                            current.filter((item) => item.key !== guest.key),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </IconDanger>
                    </div>
                  </GuestHeader>
                  <FormGrid>
                    <Field>
                      <label>Nome completo *</label>
                      <input
                        value={guest.name}
                        onChange={(event) =>
                          updateGuest(guest.key, "name", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <label>Quarto</label>
                      <select
                        value={guest.room_id ?? ""}
                        onChange={(event) =>
                          updateGuest(
                            guest.key,
                            "room_id",
                            event.target.value || null,
                          )
                        }
                      >
                        <option value="">Não definido</option>
                        {rooms.map((selected) => {
                          const room = data.rooms.find(
                            (item) => item.room_id === selected.room_id,
                          );
                          return (
                            room && (
                              <option key={room.room_id} value={room.room_id}>
                                {roomLabel(room)}
                              </option>
                            )
                          );
                        })}
                      </select>
                    </Field>
                    <Field>
                      <label>Tipo de documento</label>
                      <select
                        value={guest.document_type ?? ""}
                        onChange={(event) =>
                          updateGuest(
                            guest.key,
                            "document_type",
                            event.target.value || null,
                          )
                        }
                      >
                        <option value="">Não informado</option>
                        <option value="cpf">CPF</option>
                        <option value="rg">RG</option>
                        <option value="passport">Passaporte</option>
                        <option value="other">Outro</option>
                      </select>
                    </Field>
                    <Field>
                      <label>Documento</label>
                      <input
                        value={guest.document ?? ""}
                        onChange={(event) =>
                          updateGuest(guest.key, "document", event.target.value)
                        }
                      />
                    </Field>
                    <Field>
                      <label>Nascimento</label>
                      <input
                        type="date"
                        max={todayKey()}
                        value={guest.birth_date ?? ""}
                        onChange={(event) =>
                          updateGuest(
                            guest.key,
                            "birth_date",
                            event.target.value || null,
                          )
                        }
                      />
                    </Field>
                    <Field>
                      <label>Telefone</label>
                      <input
                        value={guest.phone ?? ""}
                        onChange={(event) =>
                          updateGuest(guest.key, "phone", event.target.value)
                        }
                      />
                    </Field>
                  </FormGrid>
                </GuestBox>
              ))}
            </GuestList>
          </StepContent>
        )}
        {step === 4 && (
          <ReviewGrid>
            <ReviewHero>
              <span>
                <CalendarCheck size={20} />
              </span>
              <div>
                <small>Cliente responsável</small>
                <strong>
                  {selectedCustomer?.name ?? "Cliente não selecionado"}
                </strong>
                <p>
                  {typeLabels[draft.reservation_type]} ·{" "}
                  {sourceLabels[draft.source]}
                </p>
              </div>
            </ReviewHero>
            <ReviewItem>
              <CalendarDays size={17} />
              <div>
                <small>Período</small>
                <strong>
                  {formatDate(draft.checkin_date)} a{" "}
                  {formatDate(draft.checkout_date)}
                </strong>
                <span>
                  {nightsBetween(draft.checkin_date, draft.checkout_date)}{" "}
                  diária(s)
                </span>
              </div>
            </ReviewItem>
            <ReviewItem>
              <BedDouble size={17} />
              <div>
                <small>Quartos</small>
                <strong>{rooms.length} selecionado(s)</strong>
                <span>
                  {rooms
                    .map(
                      (selected) =>
                        data.rooms.find(
                          (room) => room.room_id === selected.room_id,
                        )?.number,
                    )
                    .filter(Boolean)
                    .join(", ")}
                </span>
              </div>
            </ReviewItem>
            <ReviewItem>
              <Users size={17} />
              <div>
                <small>Ocupação</small>
                <strong>{totalGuests} previsto(s)</strong>
                <span>{guests.length} hóspede(s) identificado(s)</span>
              </div>
            </ReviewItem>
            <ReviewTotal>
              <span>Valor estimado da hospedagem</span>
              <strong>{currency.format(estimated)}</strong>
              <small>
                O total oficial será gerado pelo banco a partir das diárias e
                cobranças.
              </small>
            </ReviewTotal>
            <FormGrid>
              <Field $full>
                <label>Observação para o cliente</label>
                <textarea
                  rows={3}
                  value={draft.customer_notes}
                  onChange={(event) =>
                    updateDraft("customer_notes", event.target.value)
                  }
                />
              </Field>
              <Field $full>
                <label>Observação interna</label>
                <textarea
                  rows={3}
                  value={draft.internal_notes}
                  onChange={(event) =>
                    updateDraft("internal_notes", event.target.value)
                  }
                />
              </Field>
            </FormGrid>
          </ReviewGrid>
        )}
        <ModalFooter>
          {step > 1 ? (
            <SecondaryButton
              type="button"
              onClick={() => setStep((current) => current - 1)}
            >
              <ArrowLeft size={15} /> Voltar
            </SecondaryButton>
          ) : (
            <SecondaryButton type="button" onClick={onClose}>
              Cancelar
            </SecondaryButton>
          )}
          <div>
            {step === 4 && !value && (
              <GhostButton
                type="button"
                disabled={isPending}
                onClick={() => submit("draft")}
              >
                <FileText size={15} /> Salvar rascunho
              </GhostButton>
            )}
            {step < 4 ? (
              <PrimaryButton type="button" onClick={next}>
                Continuar <ArrowRight size={15} />
              </PrimaryButton>
            ) : (
              <PrimaryButton
                type="button"
                disabled={isPending}
                onClick={() => submit("pending")}
              >
                <Check size={16} />{" "}
                {isPending
                  ? "Salvando..."
                  : value
                    ? "Salvar alterações"
                    : "Criar reserva"}
              </PrimaryButton>
            )}
          </div>
        </ModalFooter>
      </ModalBody>
    </>
  );
}

function CustomerForm({
  value,
  onClose,
  onResult,
}: {
  value?: CustomerRow;
  onClose: () => void;
  onResult: (result: ReservationActionResult<unknown>) => void;
}) {
  const [type, setType] = useState<CustomerRow["customer_type"]>(
    value?.customer_type ?? "person",
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    if (value) formData.set("id", value.id);
    startTransition(async () => {
      const result = await saveCustomerAction(formData);
      if (!result.ok) setError(result.message);
      onResult(result);
    });
  }
  return (
    <>
      <ModalTitle
        icon={
          type === "company" ? <Building2 size={16} /> : <UserPlus size={16} />
        }
        title={value ? "Editar cliente" : "Novo cliente"}
        description="Cadastre pessoas e empresas para reutilizar os dados em futuras reservas."
        onClose={onClose}
      />
      <ModalBody>
        <form onSubmit={submit}>
          {error && (
            <InlineError>
              <AlertCircle size={15} />
              {error}
            </InlineError>
          )}
          <FormGrid>
            <Field>
              <label>Tipo *</label>
              <select
                name="customer_type"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as CustomerRow["customer_type"])
                }
              >
                <option value="person">Pessoa física</option>
                <option value="company">Empresa</option>
              </select>
            </Field>
            <Field>
              <label>
                {type === "company" ? "Razão social" : "Nome completo"} *
              </label>
              <input name="name" required defaultValue={value?.name ?? ""} />
            </Field>
            {type === "company" && (
              <Field>
                <label>Nome fantasia</label>
                <input
                  name="trade_name"
                  defaultValue={value?.trade_name ?? ""}
                />
              </Field>
            )}
            <Field>
              <label>Tipo de documento</label>
              <select
                name="document_type"
                defaultValue={value?.document_type ?? ""}
              >
                <option value="">Não informado</option>
                <option value={type === "company" ? "cnpj" : "cpf"}>
                  {type === "company" ? "CNPJ" : "CPF"}
                </option>
                {type === "person" && <option value="rg">RG</option>}
                <option value="passport">Passaporte</option>
                <option value="other">Outro</option>
              </select>
            </Field>
            <Field>
              <label>Documento</label>
              <input name="document" defaultValue={value?.document ?? ""} />
            </Field>
            {type === "person" && (
              <Field>
                <label>Data de nascimento</label>
                <input
                  type="date"
                  name="birth_date"
                  max={todayKey()}
                  defaultValue={value?.birth_date ?? ""}
                />
              </Field>
            )}
            <Field>
              <label>Telefone</label>
              <input name="phone" defaultValue={value?.phone ?? ""} />
            </Field>
            <Field>
              <label>E-mail</label>
              <input
                type="email"
                name="email"
                defaultValue={value?.email ?? ""}
              />
            </Field>
            {type === "company" && (
              <>
                <Field>
                  <label>Responsável/contato</label>
                  <input
                    name="contact_name"
                    defaultValue={value?.contact_name ?? ""}
                  />
                </Field>
                <Field>
                  <label>Telefone do contato</label>
                  <input
                    name="contact_phone"
                    defaultValue={value?.contact_phone ?? ""}
                  />
                </Field>
                <Field>
                  <label>E-mail do contato</label>
                  <input
                    type="email"
                    name="contact_email"
                    defaultValue={value?.contact_email ?? ""}
                  />
                </Field>
              </>
            )}
            <Field>
              <label>CEP</label>
              <input
                name="postal_code"
                defaultValue={value?.postal_code ?? ""}
              />
            </Field>
            <Field>
              <label>Logradouro</label>
              <input name="street" defaultValue={value?.street ?? ""} />
            </Field>
            <Field>
              <label>Número</label>
              <input
                name="street_number"
                defaultValue={value?.street_number ?? ""}
              />
            </Field>
            <Field>
              <label>Complemento</label>
              <input
                name="address_complement"
                defaultValue={value?.address_complement ?? ""}
              />
            </Field>
            <Field>
              <label>Bairro</label>
              <input
                name="neighborhood"
                defaultValue={value?.neighborhood ?? ""}
              />
            </Field>
            <Field>
              <label>Cidade</label>
              <input name="city" defaultValue={value?.city ?? ""} />
            </Field>
            <Field>
              <label>Estado</label>
              <input
                name="state"
                maxLength={2}
                defaultValue={value?.state ?? ""}
              />
            </Field>
            <Field $full>
              <label>Observações</label>
              <textarea
                name="notes"
                rows={3}
                defaultValue={value?.notes ?? ""}
              />
            </Field>
          </FormGrid>
          <ModalFooter>
            <SecondaryButton type="button" onClick={onClose}>
              Cancelar
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isPending}>
              <Check size={16} />
              {isPending ? "Salvando..." : "Salvar cliente"}
            </PrimaryButton>
          </ModalFooter>
        </form>
      </ModalBody>
    </>
  );
}

function ReservationDetails({
  value,
  initialTab = "overview",
  canOperate,
  canFinance,
  onClose,
  onModal,
  onResult,
}: {
  value: ReservationRow;
  initialTab?: DetailsTab;
  canOperate: boolean;
  canFinance: boolean;
  onClose: () => void;
  onModal: (modal: ModalState) => void;
  onResult: (
    result: ReservationActionResult<unknown>,
    keepOpen?: boolean,
  ) => void;
}) {
  const [tab, setTab] = useState<DetailsTab>(initialTab);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const total = reservationTotal(value);
  const paid = paidTotal(value);
  const balance = total - paid;
  function addNote() {
    startTransition(async () => {
      const result = await addReservationNoteAction(value.id, note);
      if (result.ok) setNote("");
      onResult(result, true);
    });
  }
  function openAttachment(id: string) {
    startTransition(async () => {
      const result = await getAttachmentUrlAction(id);
      if (result.ok && result.data?.url)
        window.open(result.data.url, "_blank", "noopener,noreferrer");
      else onResult(result, true);
    });
  }
  return (
    <>
      <ModalTitle
        icon={<Eye size={16} />}
        title={`${value.code} · ${value.customer_name_snapshot}`}
        description={`${typeLabels[value.reservation_type]} · ${formatDate(value.checkin_date)} a ${formatDate(value.checkout_date)}`}
        onClose={onClose}
      />
      <DetailsTabs>
        {(["overview", "guests", "finance", "timeline"] as DetailsTab[]).map(
          (item) => (
            <button
              type="button"
              key={item}
              data-active={tab === item}
              onClick={() => setTab(item)}
            >
              {item === "overview"
                ? "Resumo"
                : item === "guests"
                  ? "Hóspedes"
                  : item === "finance"
                    ? "Financeiro"
                    : "Linha do tempo"}
            </button>
          ),
        )}
      </DetailsTabs>
      <ModalBody>
        {tab === "overview" && (
          <DetailsContent>
            <DetailHero $tone={statusMeta[value.status].tone}>
              <span>
                <CalendarCheck size={21} />
              </span>
              <div>
                <StatusBadge $tone={statusMeta[value.status].tone}>
                  <i />
                  {statusMeta[value.status].label}
                </StatusBadge>
                <strong>{value.customer_name_snapshot}</strong>
                <small>{value.contact_phone || "Telefone não informado"}</small>
              </div>
            </DetailHero>
            <DetailGrid>
              <DetailItem>
                <span>Entrada</span>
                <strong>{formatDate(value.checkin_date)}</strong>
              </DetailItem>
              <DetailItem>
                <span>Saída</span>
                <strong>{formatDate(value.checkout_date)}</strong>
              </DetailItem>
              <DetailItem>
                <span>Ocupação</span>
                <strong>
                  {value.adults_count} adulto(s) · {value.children_count}{" "}
                  criança(s)
                </strong>
              </DetailItem>
              <DetailItem>
                <span>Origem</span>
                <strong>{sourceLabels[value.source]}</strong>
              </DetailItem>
            </DetailGrid>
            <SectionHeading>
              <div>
                <h3>Quartos da reserva</h3>
                <p>Diárias e ocupação registradas.</p>
              </div>
            </SectionHeading>
            <RoomsSummary>
              {value.reservation_rooms.map((room) => (
                <div key={room.id}>
                  <span>
                    <BedDouble size={16} />
                  </span>
                  <div>
                    <strong>Quarto {room.room_number_snapshot}</strong>
                    <small>
                      {room.room_type_snapshot} · {room.guests_count} hóspede(s)
                    </small>
                  </div>
                  <b>{currency.format(room.subtotal_amount)}</b>
                </div>
              ))}
            </RoomsSummary>
            <SectionHeading>
              <div>
                <h3>Documentos</h3>
                <p>Comprovantes e documentos vinculados à reserva.</p>
              </div>
              {canOperate && (
                <SecondaryButton
                  type="button"
                  onClick={() => onModal({ kind: "document", value })}
                >
                  <Plus size={14} /> Anexar
                </SecondaryButton>
              )}
            </SectionHeading>
            {value.attachments.length ? (
              <DocumentList>
                {value.attachments.map((attachment) => (
                  <button
                    type="button"
                    key={attachment.id}
                    disabled={isPending}
                    onClick={() => openAttachment(attachment.id)}
                  >
                    <FileText size={15} />
                    <span>
                      <strong>{attachment.original_name}</strong>
                      <small>
                        {attachment.category === "identity_document"
                          ? "Documento de identificação"
                          : attachment.category === "reservation_proof"
                            ? "Comprovante da reserva"
                            : "Outro documento"}
                      </small>
                    </span>
                    <Download size={14} />
                  </button>
                ))}
              </DocumentList>
            ) : (
              <MiniEmpty>
                <FileText size={22} />
                <strong>Nenhum documento anexado</strong>
                <span>Os arquivos da reserva aparecerão aqui.</span>
              </MiniEmpty>
            )}
            {(value.customer_notes || value.internal_notes) && (
              <Notes>
                {value.customer_notes && (
                  <div>
                    <span>Para o cliente</span>
                    <p>{value.customer_notes}</p>
                  </div>
                )}
                {value.internal_notes && (
                  <div>
                    <span>Observação interna</span>
                    <p>{value.internal_notes}</p>
                  </div>
                )}
              </Notes>
            )}
          </DetailsContent>
        )}
        {tab === "guests" && (
          <DetailsContent>
            <SectionHeading>
              <div>
                <h3>Integrantes</h3>
                <p>
                  {value.reservation_guests.length} hóspede(s) identificado(s).
                </p>
              </div>
              {canOperate &&
                !["checked_out", "cancelled", "no_show"].includes(
                  value.status,
                ) && (
                  <SecondaryButton
                    type="button"
                    onClick={() => onModal({ kind: "reservation", value })}
                  >
                    <Edit3 size={15} /> Editar integrantes
                  </SecondaryButton>
                )}
            </SectionHeading>
            {value.reservation_guests.length ? (
              <GuestSummary>
                {value.reservation_guests.map((guest) => (
                  <div key={guest.id}>
                    <CustomerAvatar>
                      {guest.name.slice(0, 2).toUpperCase()}
                    </CustomerAvatar>
                    <span>
                      <strong>
                        {guest.name}
                        {guest.is_primary && <em>Principal</em>}
                      </strong>
                      <small>
                        {guest.document || "Documento não informado"} ·{" "}
                        {guest.phone || "Sem telefone"}
                      </small>
                    </span>
                    <b>{guest.is_minor ? "Menor" : "Adulto"}</b>
                  </div>
                ))}
              </GuestSummary>
            ) : (
              <MiniEmpty>
                <Users size={24} />
                <strong>Nenhum hóspede identificado</strong>
                <span>Edite a reserva para cadastrar os integrantes.</span>
              </MiniEmpty>
            )}
          </DetailsContent>
        )}
        {tab === "finance" && (
          <DetailsContent>
            <FinancialHero>
              <div>
                <small>Total da reserva</small>
                <strong>{currency.format(total)}</strong>
              </div>
              <div>
                <small>Recebido líquido</small>
                <strong>{currency.format(paid)}</strong>
              </div>
              <div data-balance>
                <small>Saldo</small>
                <strong>{currency.format(balance)}</strong>
              </div>
            </FinancialHero>
            <SectionHeading>
              <div>
                <h3>Cobranças</h3>
                <p>Hospedagem, extras, serviços e ajustes.</p>
              </div>
              {canFinance &&
                !["checked_out", "cancelled", "no_show"].includes(
                  value.status,
                ) && (
                  <SecondaryButton
                    type="button"
                    onClick={() => onModal({ kind: "charge", value })}
                  >
                    <Plus size={15} /> Cobrança
                  </SecondaryButton>
                )}
            </SectionHeading>
            <FinanceList>
              <FinanceRow>
                <span>
                  <BedDouble size={16} />
                </span>
                <div>
                  <strong>Hospedagem</strong>
                  <small>{value.reservation_rooms.length} quarto(s)</small>
                </div>
                <b>{currency.format(accommodationTotal(value))}</b>
              </FinanceRow>
              {value.reservation_charges.map((charge) => (
                <FinanceRow key={charge.id} $void={charge.status === "void"}>
                  <span>
                    <FileText size={16} />
                  </span>
                  <div>
                    <strong>{charge.description}</strong>
                    <small>
                      {chargeLabels[charge.charge_type]} · {charge.quantity} ×{" "}
                      {currency.format(charge.unit_amount)}
                    </small>
                  </div>
                  <b>{currency.format(charge.total_amount)}</b>
                  {canFinance &&
                    charge.status === "active" &&
                    !["checked_out", "cancelled", "no_show"].includes(
                      value.status,
                    ) && (
                      <IconDanger
                        type="button"
                        title="Anular cobrança"
                        onClick={() =>
                          onModal({
                            kind: "operation",
                            value,
                            chargeId: charge.id,
                            operation: "void-charge",
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </IconDanger>
                    )}
                </FinanceRow>
              ))}
            </FinanceList>
            <SectionHeading>
              <div>
                <h3>Pagamentos e estornos</h3>
                <p>Movimentações financeiras vinculadas.</p>
              </div>
              {canFinance &&
                !["draft", "cancelled", "no_show"].includes(value.status) && (
                  <PrimaryMini
                    type="button"
                    onClick={() => onModal({ kind: "payment", value })}
                  >
                    <CreditCard size={14} /> Pagamento
                  </PrimaryMini>
                )}
            </SectionHeading>
            {value.payments.length ? (
              <FinanceList>
                {value.payments.map((payment) => (
                  <FinanceRow
                    key={payment.id}
                    $void={payment.status === "cancelled"}
                  >
                    <span>
                      {payment.payment_type === "refund" ? (
                        <RotateCcw size={16} />
                      ) : (
                        <WalletCards size={16} />
                      )}
                    </span>
                    <div>
                      <strong>
                        {payment.payment_type === "refund"
                          ? "Estorno"
                          : payment.payment_methods?.name || "Pagamento"}
                      </strong>
                      <small>
                        {dateTime.format(new Date(payment.paid_at))} ·{" "}
                        {payment.status === "confirmed"
                          ? "Confirmado"
                          : payment.status === "pending"
                            ? "Pendente"
                            : "Cancelado"}
                      </small>
                      {payment.attachments.map((attachment) => (
                        <AttachmentButton
                          type="button"
                          key={attachment.id}
                          disabled={isPending}
                          onClick={() => openAttachment(attachment.id)}
                        >
                          <Download size={11} />
                          {attachment.original_name}
                        </AttachmentButton>
                      ))}
                    </div>
                    <b>
                      {payment.payment_type === "refund" ? "-" : ""}
                      {currency.format(payment.amount)}
                    </b>
                    <PaymentActions>
                      {canFinance && payment.status === "pending" && (
                        <IconButton
                          type="button"
                          title="Confirmar pagamento"
                          onClick={() =>
                            startTransition(async () =>
                              onResult(
                                await confirmPaymentAction(payment.id),
                                true,
                              ),
                            )
                          }
                        >
                          <Check size={14} />
                        </IconButton>
                      )}
                      {canFinance &&
                        payment.payment_type === "payment" &&
                        payment.status === "confirmed" && (
                          <IconButton
                            type="button"
                            title="Estornar"
                            onClick={() =>
                              onModal({ kind: "refund", value, payment })
                            }
                          >
                            <RotateCcw size={14} />
                          </IconButton>
                        )}
                      {canFinance && payment.status !== "cancelled" && (
                        <IconDanger
                          type="button"
                          title="Cancelar pagamento"
                          onClick={() =>
                            onModal({
                              kind: "operation",
                              value,
                              payment,
                              operation: "cancel-payment",
                            })
                          }
                        >
                          <X size={14} />
                        </IconDanger>
                      )}
                    </PaymentActions>
                  </FinanceRow>
                ))}
              </FinanceList>
            ) : (
              <MiniEmpty>
                <CreditCard size={24} />
                <strong>Nenhum pagamento registrado</strong>
                <span>O saldo permanece integralmente em aberto.</span>
              </MiniEmpty>
            )}
          </DetailsContent>
        )}
        {tab === "timeline" && (
          <DetailsContent>
            <NoteComposer>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Adicione uma nota operacional à reserva..."
              />
              <PrimaryMini
                type="button"
                disabled={isPending || note.trim().length < 2}
                onClick={addNote}
              >
                <Send size={14} /> Salvar nota
              </PrimaryMini>
            </NoteComposer>
            {value.reservation_events.length ? (
              <Timeline>
                {value.reservation_events.map((event) => (
                  <div key={event.id}>
                    <i />
                    <span>
                      <strong>{event.description}</strong>
                      <small>
                        {dateTime.format(new Date(event.created_at))} ·{" "}
                        {event.source === "manual" ? "Nota manual" : "Sistema"}
                      </small>
                    </span>
                  </div>
                ))}
              </Timeline>
            ) : (
              <MiniEmpty>
                <Clock3 size={24} />
                <strong>Linha do tempo vazia</strong>
                <span>Os próximos eventos da reserva aparecerão aqui.</span>
              </MiniEmpty>
            )}
          </DetailsContent>
        )}
        <DetailActions>
          {canOperate &&
            !["checked_out", "cancelled", "no_show"].includes(value.status) && (
              <SecondaryButton
                type="button"
                onClick={() => onModal({ kind: "reservation", value })}
              >
                <Edit3 size={15} /> Editar
              </SecondaryButton>
            )}
          {value.status === "pending" && canOperate && (
            <PrimaryButton
              type="button"
              onClick={() =>
                onModal({ kind: "operation", value, operation: "confirm" })
              }
            >
              <BadgeCheck size={16} /> Confirmar
            </PrimaryButton>
          )}
          {value.status === "confirmed" && canOperate && (
            <PrimaryButton
              type="button"
              onClick={() =>
                onModal({ kind: "operation", value, operation: "checkin" })
              }
            >
              <LogIn size={16} /> Fazer check-in
            </PrimaryButton>
          )}
          {value.status === "checked_in" && canOperate && (
            <PrimaryButton
              type="button"
              onClick={() =>
                onModal({ kind: "operation", value, operation: "checkout" })
              }
            >
              <LogOut size={16} /> Fazer check-out
            </PrimaryButton>
          )}
        </DetailActions>
      </ModalBody>
    </>
  );
}

function ChargeForm({
  value,
  onClose,
  onResult,
}: {
  value: ReservationRow;
  onClose: () => void;
  onResult: (result: ReservationActionResult<unknown>) => void;
}) {
  const [type, setType] = useState("extra");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("reservation_id", value.id);
    startTransition(async () => {
      const result = await saveChargeAction(formData);
      if (!result.ok) setError(result.message);
      onResult(result);
    });
  }
  return (
    <>
      <ModalTitle
        icon={<CircleDollarSign size={16} />}
        title="Adicionar cobrança"
        description={`${value.code} · ${value.customer_name_snapshot}`}
        onClose={onClose}
      />
      <ModalBody>
        <form onSubmit={submit}>
          {error && (
            <InlineError>
              <AlertCircle size={15} />
              {error}
            </InlineError>
          )}
          <FormGrid>
            <Field>
              <label>Tipo *</label>
              <select
                name="charge_type"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                {Object.entries(chargeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <label>Data</label>
              <input type="date" name="charge_date" defaultValue={todayKey()} />
            </Field>
            <Field $full>
              <label>Descrição *</label>
              <input name="description" required />
            </Field>
            <Field>
              <label>Quantidade *</label>
              <input
                type="number"
                name="quantity"
                min="0.01"
                step="0.01"
                defaultValue="1"
                required
              />
            </Field>
            <Field>
              <label>Valor unitário (R$) *</label>
              <input
                type="number"
                name="unit_amount"
                step="0.01"
                max={type === "discount" ? 0 : undefined}
                defaultValue={type === "discount" ? "-0.00" : "0.00"}
                required
              />
            </Field>
            <Field $full>
              <label>Observações</label>
              <textarea name="notes" rows={3} />
            </Field>
          </FormGrid>
          <ModalFooter>
            <SecondaryButton type="button" onClick={onClose}>
              Cancelar
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isPending}>
              <Plus size={15} />
              {isPending ? "Adicionando..." : "Adicionar cobrança"}
            </PrimaryButton>
          </ModalFooter>
        </form>
      </ModalBody>
    </>
  );
}

function PaymentForm({
  value,
  methods,
  onClose,
  onResult,
}: {
  value: ReservationRow;
  methods: ReservationsModuleData["paymentMethods"];
  onClose: () => void;
  onResult: (result: ReservationActionResult<unknown>) => void;
}) {
  const balance = Math.max(0, reservationTotal(value) - paidTotal(value));
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [confirm, setConfirm] = useState(true);
  const [error, setError] = useState("");
  const [paidAtDefault] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [isPending, startTransition] = useTransition();
  const method = methods.find((item) => item.id === methodId);
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("reservation_id", value.id);
    formData.set("confirm_now", String(confirm));
    startTransition(async () => {
      const result = await savePaymentAction(formData);
      if (!result.ok) setError(result.message);
      onResult(result);
    });
  }
  return (
    <>
      <ModalTitle
        icon={<CreditCard size={16} />}
        title="Registrar pagamento"
        description={`${value.code} · Saldo atual ${currency.format(balance)}`}
        onClose={onClose}
      />
      <ModalBody>
        <form onSubmit={submit} encType="multipart/form-data">
          {error && (
            <InlineError>
              <AlertCircle size={15} />
              {error}
            </InlineError>
          )}
          <FormGrid>
            <Field>
              <label>Forma de pagamento *</label>
              <select
                name="payment_method_id"
                value={methodId}
                onChange={(event) => setMethodId(event.target.value)}
              >
                <option value="">Selecione</option>
                {methods.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <label>Valor (R$) *</label>
              <input
                type="number"
                name="amount"
                min="0.01"
                step="0.01"
                defaultValue={balance.toFixed(2)}
                required
              />
            </Field>
            <Field>
              <label>Data e hora</label>
              <input
                type="datetime-local"
                name="paid_at"
                defaultValue={paidAtDefault}
              />
            </Field>
            <Field>
              <label>Referência externa</label>
              <input name="external_reference" placeholder="NSU, ID Pix..." />
            </Field>
            <Field $full>
              <label>
                Comprovante {method?.requires_attachment && confirm ? "*" : ""}
              </label>
              <FileInput>
                <FileText size={17} />
                <input
                  type="file"
                  name="attachment"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  required={Boolean(method?.requires_attachment && confirm)}
                />
                <span>JPEG, PNG, WebP ou PDF · até 10 MB</span>
              </FileInput>
            </Field>
            <Field $full>
              <label>Observações</label>
              <textarea name="notes" rows={3} />
            </Field>
          </FormGrid>
          <CheckLine>
            <input
              type="checkbox"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
            />
            <span>
              <strong>Confirmar pagamento agora</strong>
              <small>
                Ao confirmar, o banco gera a movimentação financeira e pode
                confirmar a reserva automaticamente.
              </small>
            </span>
          </CheckLine>
          <ModalFooter>
            <SecondaryButton type="button" onClick={onClose}>
              Cancelar
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              disabled={isPending || !methods.length}
            >
              <CreditCard size={15} />
              {isPending ? "Registrando..." : "Registrar pagamento"}
            </PrimaryButton>
          </ModalFooter>
        </form>
      </ModalBody>
    </>
  );
}

function RefundForm({
  value,
  payment,
  onClose,
  onResult,
}: {
  value: ReservationRow;
  payment: PaymentRow;
  onClose: () => void;
  onResult: (result: ReservationActionResult<unknown>) => void;
}) {
  const confirmedRefunds = value.payments
    .filter(
      (item) =>
        item.payment_type === "refund" &&
        item.original_payment_id === payment.id &&
        item.status === "confirmed",
    )
    .reduce((sum, item) => sum + item.amount, 0);
  const available = payment.amount - confirmedRefunds;
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("original_payment_id", payment.id);
    startTransition(async () => {
      const result = await refundPaymentAction(formData);
      if (!result.ok) setError(result.message);
      onResult(result);
    });
  }
  return (
    <>
      <ModalTitle
        icon={<RotateCcw size={16} />}
        title="Estornar pagamento"
        description={`Disponível para estorno: ${currency.format(available)}`}
        onClose={onClose}
      />
      <ModalBody>
        <form onSubmit={submit} encType="multipart/form-data">
          {error && (
            <InlineError>
              <AlertCircle size={15} />
              {error}
            </InlineError>
          )}
          <FormGrid>
            <Field $full>
              <label>Valor do estorno (R$) *</label>
              <input
                type="number"
                name="amount"
                min="0.01"
                max={available}
                step="0.01"
                defaultValue={available.toFixed(2)}
                required
              />
            </Field>
            <Field $full>
              <label>Motivo/observações</label>
              <textarea name="notes" rows={3} required />
            </Field>
            <Field $full>
              <label>
                Comprovante{" "}
                {payment.payment_methods?.requires_attachment ? "*" : ""}
              </label>
              <FileInput>
                <FileText size={17} />
                <input
                  type="file"
                  name="attachment"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  required={Boolean(
                    payment.payment_methods?.requires_attachment,
                  )}
                />
                <span>JPEG, PNG, WebP ou PDF · até 10 MB</span>
              </FileInput>
            </Field>
          </FormGrid>
          <InfoBox>
            <AlertCircle size={15} />O estorno confirmado cria automaticamente a
            movimentação financeira inversa.
          </InfoBox>
          <ModalFooter>
            <SecondaryButton type="button" onClick={onClose}>
              Voltar
            </SecondaryButton>
            <DangerButton type="submit" disabled={isPending}>
              <RotateCcw size={15} />
              {isPending ? "Estornando..." : "Confirmar estorno"}
            </DangerButton>
          </ModalFooter>
        </form>
      </ModalBody>
    </>
  );
}

function DocumentForm({
  value,
  onClose,
  onResult,
}: {
  value: ReservationRow;
  onClose: () => void;
  onResult: (result: ReservationActionResult<unknown>) => void;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("reservation_id", value.id);
    startTransition(async () => {
      const result = await uploadReservationAttachmentAction(formData);
      if (!result.ok) setError(result.message);
      onResult(result);
    });
  }
  return (
    <>
      <ModalTitle
        icon={<FileText size={16} />}
        title="Anexar documento"
        description={`${value.code} · ${value.customer_name_snapshot}`}
        onClose={onClose}
      />
      <ModalBody>
        <form onSubmit={submit} encType="multipart/form-data">
          {error && (
            <InlineError>
              <AlertCircle size={15} />
              {error}
            </InlineError>
          )}
          <FormGrid>
            <Field $full>
              <label>Categoria *</label>
              <select name="category">
                <option value="reservation_proof">
                  Comprovante da reserva
                </option>
                <option value="identity_document">
                  Documento de identificação
                </option>
                <option value="other">Outro documento</option>
              </select>
            </Field>
            <Field $full>
              <label>Arquivo *</label>
              <FileInput>
                <FileText size={17} />
                <input
                  type="file"
                  name="attachment"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  required
                />
                <span>JPEG, PNG, WebP ou PDF · até 10 MB</span>
              </FileInput>
            </Field>
            <Field $full>
              <label>Descrição</label>
              <input name="description" />
            </Field>
          </FormGrid>
          <ModalFooter>
            <SecondaryButton type="button" onClick={onClose}>
              Cancelar
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={isPending}>
              <Download size={15} />
              {isPending ? "Enviando..." : "Anexar documento"}
            </PrimaryButton>
          </ModalFooter>
        </form>
      </ModalBody>
    </>
  );
}

function OperationDialog({
  modal,
  onClose,
  onResult,
}: {
  modal: Extract<ModalState, { kind: "operation" }>;
  onClose: () => void;
  onResult: (result: ReservationActionResult<unknown>) => void;
}) {
  const needsReason =
    modal.operation === "cancel" || modal.operation === "cancel-payment";
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const content: Record<
    Operation,
    {
      title: string;
      description: string;
      confirm: string;
      danger?: boolean;
      icon: React.ReactNode;
    }
  > = {
    confirm: {
      title: "Confirmar reserva",
      description: "A reserva passará a ocupar o inventário como confirmada.",
      confirm: "Confirmar reserva",
      icon: <BadgeCheck size={22} />,
    },
    checkin: {
      title: "Realizar check-in",
      description:
        "Todos os quartos e dados da hospedagem serão validados pelo sistema.",
      confirm: "Realizar check-in",
      icon: <LogIn size={22} />,
    },
    checkout: {
      title: "Realizar check-out",
      description:
        "A hospedagem será encerrada e os quartos serão liberados. O saldo pode continuar em aberto.",
      confirm: "Realizar check-out",
      icon: <LogOut size={22} />,
    },
    cancel: {
      title: "Cancelar reserva",
      description:
        "A reserva irá para o histórico e os quartos serão liberados.",
      confirm: "Cancelar reserva",
      danger: true,
      icon: <XCircle size={22} />,
    },
    "no-show": {
      title: "Marcar como não compareceu",
      description:
        "A reserva será encerrada como no-show e permanecerá no histórico.",
      confirm: "Confirmar no-show",
      danger: true,
      icon: <ShieldAlert size={22} />,
    },
    "cancel-payment": {
      title: "Cancelar pagamento",
      description:
        "A movimentação relacionada será cancelada conforme as regras financeiras.",
      confirm: "Cancelar pagamento",
      danger: true,
      icon: <XCircle size={22} />,
    },
    "void-charge": {
      title: "Anular cobrança",
      description: "A cobrança será mantida no histórico com situação anulada.",
      confirm: "Anular cobrança",
      danger: true,
      icon: <Trash2 size={22} />,
    },
    "archive-customer": {
      title: "Arquivar cliente",
      description:
        "O cliente não será usado em novas reservas, mas todo o histórico será preservado.",
      confirm: "Arquivar cliente",
      danger: true,
      icon: <Trash2 size={22} />,
    },
  };
  const item = content[modal.operation];
  function confirm() {
    if (needsReason && reason.trim().length < 3) {
      setError("Informe um motivo com pelo menos 3 caracteres.");
      return;
    }
    startTransition(async () => {
      let result: ReservationActionResult<unknown>;
      if (modal.operation === "confirm")
        result = await confirmReservationAction(modal.value!.id);
      else if (modal.operation === "checkin")
        result = await checkInReservationAction(modal.value!.id);
      else if (modal.operation === "checkout")
        result = await checkOutReservationAction(modal.value!.id);
      else if (modal.operation === "cancel")
        result = await cancelReservationAction(modal.value!.id, reason);
      else if (modal.operation === "no-show")
        result = await markNoShowAction(modal.value!.id);
      else if (modal.operation === "cancel-payment")
        result = await cancelPaymentAction(modal.payment!.id, reason);
      else if (modal.operation === "void-charge")
        result = await voidChargeAction(modal.chargeId!);
      else result = await archiveCustomerAction(modal.customer!.id);
      if (!result.ok) setError(result.message);
      onResult(result);
    });
  }
  return (
    <>
      <ModalTitle
        icon={item.icon}
        title={item.title}
        description={
          modal.value
            ? `${modal.value.code} · ${modal.value.customer_name_snapshot}`
            : (modal.customer?.name ?? "Ação operacional")
        }
        onClose={onClose}
      />
      <ModalBody>
        <ConfirmBox $danger={Boolean(item.danger)}>
          <span>{item.icon}</span>
          <p>{item.description}</p>
        </ConfirmBox>
        {needsReason && (
          <Field>
            <label>Motivo obrigatório *</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              autoFocus
            />
          </Field>
        )}
        {error && (
          <InlineError>
            <AlertCircle size={15} />
            {error}
          </InlineError>
        )}
        <ModalFooter>
          <SecondaryButton type="button" onClick={onClose}>
            Voltar
          </SecondaryButton>
          {item.danger ? (
            <DangerButton type="button" disabled={isPending} onClick={confirm}>
              {isPending ? "Processando..." : item.confirm}
            </DangerButton>
          ) : (
            <PrimaryButton type="button" disabled={isPending} onClick={confirm}>
              <Check size={15} />
              {isPending ? "Processando..." : item.confirm}
            </PrimaryButton>
          )}
        </ModalFooter>
      </ModalBody>
    </>
  );
}

const toneStyles = css<{ $tone: Tone }>`
  background: ${({ $tone, theme }) =>
    ({
      primary: theme.colors.primarySoft,
      success: theme.colors.successSoft,
      warning: theme.colors.warningSoft,
      danger: theme.colors.dangerSoft,
      purple: theme.colors.purpleSoft,
      neutral: theme.colors.surfaceSoft,
    })[$tone]};
  color: ${({ $tone, theme }) =>
    ({
      primary: theme.colors.primary,
      success: theme.colors.success,
      warning: theme.colors.warning,
      danger: theme.colors.danger,
      purple: theme.colors.purple,
      neutral: theme.colors.muted,
    })[$tone]};
`;
const buttonBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 800;
  transition: 160ms ease;
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;
const Page = styled.main`
  display: grid;
  gap: 22px;
`;
const PageHeader = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  h2 {
    margin: 7px 0;
    font-size: clamp(24px, 3vw, 30px);
    letter-spacing: -0.045em;
  }
  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 14px;
    line-height: 1.6;
  }
  @media (max-width: 650px) {
    align-items: stretch;
    flex-direction: column;
  }
`;
const Eyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 12px;
  font-weight: 850;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;
const PrimaryButton = styled.button`
  ${buttonBase};
  border: 0;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  box-shadow: 0 12px 26px rgba(67, 76, 228, 0.2);
  &:not(:disabled):hover {
    transform: translateY(-1px);
    filter: brightness(0.97);
  }
`;
const SecondaryButton = styled.button`
  ${buttonBase};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  &:not(:disabled):hover {
    border-color: ${({ theme }) => theme.colors.borderStrong};
    background: ${({ theme }) => theme.colors.surfaceSoft};
  }
`;
const DangerButton = styled.button`
  ${buttonBase};
  border: 0;
  background: ${({ theme }) => theme.colors.danger};
  color: white;
`;
const Warning = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 15px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.warningSoft};
  color: #8a5a00;
  font-size: 13px;
  font-weight: 650;
`;
const StatsGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  @media (max-width: 1120px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;
const StatCard = styled.article`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};
  div:last-child {
    display: grid;
    gap: 2px;
  }
  span {
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 12px;
    font-weight: 700;
  }
  strong {
    font-size: 25px;
    letter-spacing: -0.04em;
  }
  small {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 11px;
  }
`;
const StatIcon = styled.div<{ $tone: Tone }>`
  ${toneStyles};
  display: grid;
  flex: 0 0 auto;
  width: 45px;
  height: 45px;
  place-items: center;
  border-radius: 12px;
`;
const Panel = styled.section`
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;
const Tabs = styled.div`
  display: flex;
  gap: 5px;
  padding: 10px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;
const TabButton = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primarySoft : "transparent"};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary : theme.colors.textSoft};
  font-size: 13px;
  font-weight: 800;
`;
const Count = styled.span`
  display: grid;
  min-width: 22px;
  height: 22px;
  place-items: center;
  padding: 0 5px;
  border-radius: 8px;
  background: rgba(67, 76, 228, 0.09);
  font-size: 10px;
`;
const Section = styled.div`
  display: grid;
  gap: 20px;
  padding: 22px;
  @media (max-width: 600px) {
    padding: 16px;
  }
`;
const Toolbar = styled.div<{ $customers: boolean }>`
  display: grid;
  grid-template-columns: minmax(260px, 1fr) ${({ $customers }) =>
      $customers ? "auto" : "auto auto"};
  gap: 10px;
  @media (max-width: 860px) {
    grid-template-columns: 1fr 1fr;
    > :first-child {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 560px) {
    grid-template-columns: 1fr;
    > :first-child {
      grid-column: auto;
    }
  }
`;
const control = css`
  min-height: 44px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surfaceSoft};
  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 3px rgba(67, 76, 228, 0.1);
  }
`;
const SearchBox = styled.div`
  ${control};
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 13px;
  color: ${({ theme }) => theme.colors.muted};
  input {
    width: 100%;
    border: 0;
    background: transparent;
    outline: 0;
    font-size: 13px;
  }
`;
const ClearButton = styled.button`
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
`;
const FilterBox = styled.div`
  ${control};
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px 0 12px;
  color: ${({ theme }) => theme.colors.muted};
  select {
    min-width: 145px;
    height: 42px;
    border: 0;
    background: transparent;
    outline: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 12px;
    font-weight: 700;
    appearance: none;
  }
`;
const ReservationCards = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  @media (max-width: 1180px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;
const ReservationCard = styled.article`
  display: grid;
  padding: 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  transition: 170ms ease;
  &:hover {
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.shadow.hover};
  }
`;
const CardTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  > div:first-child {
    display: flex;
    align-items: center;
    gap: 9px;
  }
`;
const Code = styled.strong`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.primary};
`;
const StatusBadge = styled.span<{ $tone: Tone }>`
  ${toneStyles};
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  min-height: 26px;
  padding: 0 9px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 850;
  white-space: nowrap;
  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
`;
const Actions = styled.div`
  display: flex;
  gap: 5px;
`;
const IconButton = styled.button`
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSoft};
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;
const IconDanger = styled(IconButton)`
  color: ${({ theme }) => theme.colors.danger};
`;
const Menu = styled.div`
  position: relative;
  &:hover > div,
  &:focus-within > div {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
`;
const MenuButton = styled(IconButton)``;
const MenuPopover = styled.div`
  position: absolute;
  top: 38px;
  right: 0;
  z-index: 15;
  display: grid;
  width: 190px;
  padding: 6px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.16);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: 140ms ease;
  button {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 11px;
    font-weight: 750;
    text-align: left;
    &:hover {
      background: ${({ theme }) => theme.colors.surfaceSoft};
      color: ${({ theme }) => theme.colors.primary};
    }
    &.danger {
      color: ${({ theme }) => theme.colors.danger};
    }
  }
`;
const GuestName = styled.h3`
  margin: 16px 0 3px;
  overflow: hidden;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const ReservationKind = styled.small`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 10px;
  font-weight: 700;
`;
const StayBox = styled.div`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  margin: 15px 0 11px;
  padding: 12px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surfaceSoft};
`;
const StayDate = styled.div`
  display: grid;
  gap: 2px;
  &:last-child {
    text-align: right;
  }
  small {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 9px;
  }
  strong {
    font-size: 11px;
  }
`;
const StayArrow = styled.div`
  display: grid;
  justify-items: center;
  color: ${({ theme }) => theme.colors.primary};
  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 8px;
  }
`;
const RoomChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 25px;
  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 8px;
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.primarySoft};
    color: ${({ theme }) => theme.colors.primary};
    font-size: 9px;
    font-weight: 800;
  }
`;
const CardMetrics = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  color: ${({ theme }) => theme.colors.textSoft};
  span {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 700;
  }
`;
const Balance = styled.div<{ $settled: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 10px;
  border-radius: 10px;
  background: ${({ $settled, theme }) =>
    $settled ? theme.colors.successSoft : theme.colors.warningSoft};
  color: ${({ $settled, theme }) =>
    $settled ? theme.colors.success : "#9a6500"};
  span {
    font-size: 9px;
    font-weight: 800;
  }
  strong {
    font-size: 12px;
  }
`;
const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;
const GhostButton = styled.button`
  ${buttonBase};
  min-height: 34px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 11px;
  &:hover {
    background: ${({ theme }) => theme.colors.surfaceSoft};
    color: ${({ theme }) => theme.colors.primary};
  }
`;
const PrimaryMini = styled.button`
  ${buttonBase};
  min-height: 34px;
  padding: 0 11px;
  border: 0;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  font-size: 10px;
`;
const CustomersGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  @media (max-width: 1000px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 650px) {
    grid-template-columns: 1fr;
  }
`;
const CustomerBox = styled.article`
  display: grid;
  padding: 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  h3 {
    margin: 14px 0 3px;
    font-size: 15px;
  }
  > small {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 10px;
  }
`;
const CustomerTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;
const CustomerAvatar = styled.div`
  display: grid;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 11px;
  font-weight: 900;
`;
const CustomerInfo = styled.div`
  display: grid;
  gap: 5px;
  margin: 14px 0;
  padding: 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.surfaceSoft};
  span {
    overflow: hidden;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
const CustomerActions = styled.div`
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;
const Empty = ({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <EmptyBox>
    {icon}
    <h3>{title}</h3>
    <p>{description}</p>
    {action}
  </EmptyBox>
);
const EmptyBox = styled.div`
  display: grid;
  min-height: 290px;
  place-content: center;
  justify-items: center;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  h3 {
    margin: 14px 0 5px;
    color: ${({ theme }) => theme.colors.text};
    font-size: 16px;
  }
  p {
    max-width: 440px;
    margin: 0 0 18px;
    font-size: 12px;
    line-height: 1.6;
  }
`;
const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  overflow-y: auto;
  place-items: center;
  padding: 20px;
  background: rgba(10, 18, 35, 0.5);
  backdrop-filter: blur(3px);
  @media (max-width: 560px) {
    align-items: end;
    padding: 0;
  }
`;
const Dialog = styled.div<{ $wide: boolean }>`
  width: min(${({ $wide }) => ($wide ? "940px" : "620px")}, 100%);
  max-height: min(94vh, 980px);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: 0 30px 90px rgba(15, 23, 42, 0.25);
  @media (max-width: 560px) {
    width: 100%;
    max-height: 96vh;
    border-radius: 12px 12px 0 0;
  }
`;
const ModalHeader = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  > div:first-child {
    position: relative;
    padding-left: 43px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 18px;
    letter-spacing: -0.03em;
  }
  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 11px;
    line-height: 1.5;
  }
`;
const ModalEyebrow = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
`;
const ModalClose = styled.button`
  display: grid;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surfaceSoft};
  color: ${({ theme }) => theme.colors.textSoft};
`;
const ModalBody = styled.div`
  max-height: calc(94vh - 88px);
  overflow-y: auto;
  padding: 21px 22px;
  @media (max-width: 560px) {
    max-height: calc(96vh - 88px);
    padding: 17px 16px;
  }
`;
const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 15px;
  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;
const Field = styled.div<{ $full?: boolean }>`
  display: grid;
  grid-column: ${({ $full }) => ($full ? "1 / -1" : "auto")};
  gap: 7px;
  label {
    font-size: 11px;
    font-weight: 800;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 12px;
    background: ${({ theme }) => theme.colors.surfaceSoft};
    color: ${({ theme }) => theme.colors.text};
    outline: 0;
    font-size: 12px;
    font-weight: 600;
    resize: vertical;
    &:focus {
      border-color: ${({ theme }) => theme.colors.primary};
      box-shadow: 0 0 0 3px rgba(67, 76, 228, 0.1);
    }
  }
  textarea {
    padding-top: 11px;
  }
`;
const FieldHint = styled.small`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 9px;
`;
const ModalFooter = styled.footer`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  > div {
    display: flex;
    gap: 8px;
  }
  @media (max-width: 520px) {
    align-items: stretch;
    flex-direction: column-reverse;
    > div {
      flex-direction: column-reverse;
    }
    button {
      width: 100%;
    }
  }
`;
const InlineError = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 15px;
  padding: 11px 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.dangerSoft};
  color: ${({ theme }) => theme.colors.danger};
  font-size: 11px;
  font-weight: 700;
`;
const Progress = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 16px 28px 8px;
`;
const ProgressLine = styled.div`
  position: absolute;
  top: 28px;
  right: calc(12.5% + 28px);
  left: calc(12.5% + 28px);
  height: 2px;
  background: ${({ theme }) => theme.colors.border};
  i {
    display: block;
    height: 100%;
    background: ${({ theme }) => theme.colors.primary};
    transition: 180ms ease;
  }
`;
const ProgressStep = styled.div<{ $active: boolean }>`
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 4px;
  span {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border-radius: 50%;
    background: ${({ $active, theme }) =>
      $active ? theme.colors.primary : theme.colors.surfaceSoft};
    color: ${({ $active, theme }) => ($active ? "white" : theme.colors.muted)};
    font-size: 10px;
    font-weight: 850;
  }
  small {
    color: ${({ $active, theme }) =>
      $active ? theme.colors.text : theme.colors.muted};
    font-size: 9px;
    font-weight: 800;
  }
`;
const StepContent = styled.div`
  display: grid;
  gap: 16px;
`;
const AvailabilityBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.primarySoft};
  > div {
    display: flex;
    align-items: center;
    gap: 11px;
    color: ${({ theme }) => theme.colors.primary};
  }
  span {
    display: grid;
    gap: 3px;
  }
  strong {
    color: ${({ theme }) => theme.colors.text};
    font-size: 12px;
  }
  small {
    font-size: 10px;
  }
  @media (max-width: 620px) {
    align-items: stretch;
    flex-direction: column;
  }
`;
const SuccessLine = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: ${({ theme }) => theme.colors.success};
  font-size: 11px;
  font-weight: 700;
`;
const RoomSelector = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;
const SelectableRoom = styled.article<{ $selected: boolean }>`
  overflow: hidden;
  border: 1px solid
    ${({ $selected, theme }) =>
      $selected ? theme.colors.primary : theme.colors.border};
  border-radius: 12px;
  background: ${({ $selected, theme }) =>
    $selected ? "rgba(67,76,228,.025)" : theme.colors.surface};
  > button {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 13px;
    border: 0;
    background: transparent;
    text-align: left;
    > span {
      display: grid;
      width: 35px;
      height: 35px;
      place-items: center;
      border-radius: 10px;
      background: ${({ theme }) => theme.colors.primarySoft};
      color: ${({ theme }) => theme.colors.primary};
    }
    > div {
      display: grid;
      gap: 2px;
    }
    strong {
      font-size: 11px;
    }
    small {
      color: ${({ theme }) => theme.colors.muted};
      font-size: 9px;
    }
    b {
      font-size: 10px;
    }
    > svg {
      color: ${({ $selected, theme }) =>
        $selected ? theme.colors.primary : theme.colors.muted};
    }
  }
`;
const RoomConfig = styled.div`
  display: grid;
  grid-template-columns: 85px 110px 1fr;
  gap: 8px;
  padding: 0 13px 13px;
  label {
    display: grid;
    gap: 5px;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 8px;
    font-weight: 750;
  }
  input {
    width: 100%;
    height: 34px;
    padding: 0 8px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.surface};
    font-size: 10px;
  }
  @media (max-width: 420px) {
    grid-template-columns: 1fr 1fr;
    label:last-child {
      grid-column: 1 / -1;
    }
  }
`;
const MiniEmpty = styled.div`
  display: grid;
  min-height: 150px;
  place-content: center;
  justify-items: center;
  gap: 6px;
  color: ${({ theme }) => theme.colors.muted};
  text-align: center;
  strong {
    color: ${({ theme }) => theme.colors.text};
    font-size: 12px;
  }
  span {
    font-size: 10px;
  }
`;
const SectionHeading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  h3 {
    margin: 0 0 4px;
    font-size: 15px;
  }
  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 10px;
  }
  @media (max-width: 580px) {
    align-items: stretch;
    flex-direction: column;
  }
`;
const InfoBox = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 13px 0;
  padding: 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 10px;
  font-weight: 650;
  line-height: 1.5;
`;
const GuestList = styled.div`
  display: grid;
  gap: 11px;
`;
const GuestBox = styled.article`
  padding: 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
`;
const GuestHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
  strong {
    font-size: 12px;
  }
  > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 9px;
    font-weight: 750;
  }
`;
const ReviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 11px;
  @media (max-width: 650px) {
    grid-template-columns: 1fr;
  }
  > ${FormGrid} {
    grid-column: 1 / -1;
    margin-top: 6px;
  }
`;
const ReviewHero = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 16px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.primarySoft};
  > span {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border-radius: 12px;
    background: white;
    color: ${({ theme }) => theme.colors.primary};
  }
  > div {
    display: grid;
    gap: 2px;
  }
  small {
    color: ${({ theme }) => theme.colors.primary};
    font-size: 9px;
  }
  strong {
    font-size: 14px;
  }
  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 10px;
  }
`;
const ReviewItem = styled.div`
  display: flex;
  gap: 10px;
  padding: 13px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  color: ${({ theme }) => theme.colors.primary};
  > div {
    display: grid;
    gap: 2px;
  }
  small {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 8px;
    text-transform: uppercase;
  }
  strong {
    color: ${({ theme }) => theme.colors.text};
    font-size: 10px;
  }
  span {
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 9px;
  }
`;
const ReviewTotal = styled.div`
  grid-column: 1 / -1;
  display: grid;
  gap: 3px;
  padding: 15px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.successSoft};
  color: ${({ theme }) => theme.colors.success};
  span {
    font-size: 9px;
    font-weight: 750;
  }
  strong {
    font-size: 22px;
  }
  small {
    font-size: 9px;
  }
`;
const DetailsTabs = styled.div`
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding: 9px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  button {
    min-height: 35px;
    padding: 0 11px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
    &[data-active="true"] {
      background: ${({ theme }) => theme.colors.primarySoft};
      color: ${({ theme }) => theme.colors.primary};
    }
  }
`;
const DetailsContent = styled.div`
  display: grid;
  gap: 15px;
`;
const DetailHero = styled.div<{ $tone: Tone }>`
  ${toneStyles};
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 15px;
  border-radius: 12px;
  > span {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.65);
  }
  > div {
    display: grid;
    gap: 3px;
  }
  > div > strong {
    color: ${({ theme }) => theme.colors.text};
    font-size: 14px;
  }
  > div > small {
    font-size: 10px;
  }
`;
const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 9px;
  @media (max-width: 620px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;
const DetailItem = styled.div`
  display: grid;
  gap: 4px;
  padding: 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.surfaceSoft};
  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 8px;
    font-weight: 750;
    text-transform: uppercase;
  }
  strong {
    font-size: 10px;
  }
`;
const RoomsSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 9px;
  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
  > div {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 10px;
    > span {
      display: grid;
      width: 34px;
      height: 34px;
      place-items: center;
      border-radius: 9px;
      background: ${({ theme }) => theme.colors.primarySoft};
      color: ${({ theme }) => theme.colors.primary};
    }
    > div {
      display: grid;
      gap: 2px;
    }
    strong {
      font-size: 10px;
    }
    small {
      color: ${({ theme }) => theme.colors.muted};
      font-size: 8px;
    }
    b {
      font-size: 10px;
    }
  }
`;
const DocumentList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
  button {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 9px;
    min-height: 50px;
    padding: 10px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.primary};
    text-align: left;
    > span {
      display: grid;
      min-width: 0;
      gap: 2px;
    }
    strong {
      overflow: hidden;
      color: ${({ theme }) => theme.colors.text};
      font-size: 9px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    small {
      color: ${({ theme }) => theme.colors.muted};
      font-size: 8px;
    }
  }
`;
const Notes = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 9px;
  @media (max-width: 580px) {
    grid-template-columns: 1fr;
  }
  > div {
    padding: 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 10px;
  }
  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 8px;
    font-weight: 750;
    text-transform: uppercase;
  }
  p {
    margin: 5px 0 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 10px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
`;
const GuestSummary = styled.div`
  display: grid;
  gap: 8px;
  > div {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 11px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 10px;
    > span {
      display: grid;
      gap: 3px;
    }
    strong {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
    }
    em {
      padding: 3px 5px;
      border-radius: 5px;
      background: ${({ theme }) => theme.colors.primarySoft};
      color: ${({ theme }) => theme.colors.primary};
      font-size: 7px;
      font-style: normal;
    }
    small {
      color: ${({ theme }) => theme.colors.muted};
      font-size: 8px;
    }
    b {
      color: ${({ theme }) => theme.colors.textSoft};
      font-size: 8px;
    }
  }
`;
const FinancialHero = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  > div {
    display: grid;
    gap: 3px;
    padding: 13px;
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.surfaceSoft};
    small {
      color: ${({ theme }) => theme.colors.muted};
      font-size: 8px;
    }
    strong {
      font-size: 16px;
    }
    &[data-balance] {
      background: ${({ theme }) => theme.colors.warningSoft};
      color: #936100;
    }
  }
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;
const FinanceList = styled.div`
  display: grid;
  gap: 7px;
`;
const FinanceRow = styled.div<{ $void?: boolean }>`
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  opacity: ${({ $void }) => ($void ? 0.55 : 1)};
  > span:first-child {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border-radius: 9px;
    background: ${({ theme }) => theme.colors.primarySoft};
    color: ${({ theme }) => theme.colors.primary};
  }
  > div {
    display: grid;
    gap: 2px;
  }
  strong {
    font-size: 10px;
  }
  small {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 8px;
  }
  > b {
    font-size: 10px;
    text-decoration: ${({ $void }) => ($void ? "line-through" : "none")};
  }
`;
const PaymentActions = styled.div`
  display: flex;
  gap: 4px;
`;
const AttachmentButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
  margin-top: 3px;
  padding: 3px 5px;
  border: 0;
  border-radius: 5px;
  background: ${({ theme }) => theme.colors.surfaceSoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 7px;
  font-weight: 750;
`;
const NoteComposer = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  textarea {
    min-height: 62px;
    padding: 10px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.surfaceSoft};
    outline: 0;
    resize: vertical;
    font-size: 10px;
  }
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;
const Timeline = styled.div`
  display: grid;
  > div {
    position: relative;
    display: grid;
    grid-template-columns: 14px 1fr;
    gap: 10px;
    min-height: 54px;
    padding-bottom: 10px;
    &::before {
      position: absolute;
      top: 12px;
      bottom: -2px;
      left: 5px;
      width: 2px;
      background: ${({ theme }) => theme.colors.border};
      content: "";
    }
    &:last-child::before {
      display: none;
    }
    > i {
      position: relative;
      z-index: 1;
      width: 12px;
      height: 12px;
      margin-top: 3px;
      border: 3px solid ${({ theme }) => theme.colors.primarySoft};
      border-radius: 50%;
      background: ${({ theme }) => theme.colors.primary};
    }
    > span {
      display: grid;
      gap: 3px;
    }
    strong {
      font-size: 10px;
    }
    small {
      color: ${({ theme }) => theme.colors.muted};
      font-size: 8px;
    }
  }
`;
const DetailActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  @media (max-width: 500px) {
    flex-direction: column;
  }
`;
const FileInput = styled.div`
  position: relative;
  display: grid;
  min-height: 82px;
  place-content: center;
  justify-items: center;
  gap: 4px;
  padding: 10px;
  border: 1px dashed ${({ theme }) => theme.colors.borderStrong};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surfaceSoft};
  color: ${({ theme }) => theme.colors.primary};
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 8px;
  }
`;
const CheckLine = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 15px;
  padding: 12px;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.primarySoft};
  input {
    margin-top: 2px;
  }
  span {
    display: grid;
    gap: 3px;
  }
  strong {
    font-size: 10px;
  }
  small {
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 8px;
    line-height: 1.4;
  }
`;
const ConfirmBox = styled.div<{ $danger: boolean }>`
  display: grid;
  justify-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding: 17px;
  border-radius: 12px;
  background: ${({ $danger, theme }) =>
    $danger ? theme.colors.dangerSoft : theme.colors.primarySoft};
  color: ${({ $danger, theme }) =>
    $danger ? theme.colors.danger : theme.colors.primary};
  text-align: center;
  > span {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.65);
  }
  p {
    max-width: 450px;
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 11px;
    line-height: 1.6;
  }
`;
const Toast = styled.div<{ $ok: boolean }>`
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 200;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  width: min(390px, calc(100vw - 32px));
  padding: 13px;
  border: 1px solid
    ${({ $ok, theme }) =>
      $ok ? theme.colors.successSoft : theme.colors.dangerSoft};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.18);
  > span {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 10px;
    background: ${({ $ok, theme }) =>
      $ok ? theme.colors.successSoft : theme.colors.dangerSoft};
    color: ${({ $ok, theme }) =>
      $ok ? theme.colors.success : theme.colors.danger};
  }
  p {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
  }
  > button {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.muted};
  }
`;
