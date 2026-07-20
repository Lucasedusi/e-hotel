"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import {
  AlertCircle,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Edit3,
  Eye,
  Filter,
  Layers3,
  LockKeyhole,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  cancelRoomBlockAction,
  deleteRoomAction,
  deleteRoomTypeAction,
  saveRoomAction,
  saveRoomBlockAction,
  saveRoomTypeAction,
} from "@/app/(dashboard)/quartos/actions";
import type {
  RoomActionResult,
  RoomBlockRow,
  RoomOccupancyStatus,
  RoomRow,
  RoomsModuleData,
  RoomTypeRow,
} from "@/types/rooms";

type Tab = "rooms" | "calendar" | "types" | "blocks";
type ModalState =
  | { kind: "room"; value?: RoomRow }
  | { kind: "type"; value?: RoomTypeRow }
  | { kind: "block"; value?: RoomBlockRow; roomId?: string }
  | { kind: "details"; value: RoomRow }
  | { kind: "delete-room"; value: RoomRow }
  | { kind: "delete-type"; value: RoomTypeRow }
  | { kind: "cancel-block"; value: RoomBlockRow };

const occupancyMeta: Record<RoomOccupancyStatus, { label: string; tone: Tone; description: string }> = {
  available: { label: "Livre", tone: "success", description: "Disponível para receber hóspedes" },
  reserved: { label: "Reservado", tone: "warning", description: "Possui reserva vigente" },
  occupied: { label: "Ocupado", tone: "primary", description: "Hóspede em estadia" },
  blocked: { label: "Bloqueado", tone: "purple", description: "Indisponibilidade temporária" },
  maintenance: { label: "Manutenção", tone: "danger", description: "Fora de operação" },
  inactive: { label: "Inativo", tone: "neutral", description: "Cadastro inativo" },
};

const blockTypeLabels: Record<RoomBlockRow["block_type"], string> = {
  maintenance: "Manutenção",
  cleaning: "Limpeza",
  renovation: "Reforma",
  internal_use: "Uso interno",
  administrative: "Administrativo",
  other: "Outro",
};

const blockStatusLabels: Record<RoomBlockRow["status"], string> = {
  scheduled: "Agendado",
  active: "Ativo",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const operationalLabels: Record<RoomRow["operational_status"], string> = {
  active: "Ativo",
  maintenance: "Em manutenção",
  inactive: "Inativo",
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function toLocalInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function plural(value: number, singular: string, pluralWord: string) {
  return `${value} ${value === 1 ? singular : pluralWord}`;
}

export function RoomsModule({ data }: { data: RoomsModuleData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("rooms");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  const canManageTypes = data.role === "owner" || data.role === "admin";
  const canManageRooms = canManageTypes || data.role === "reception";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => {
    const statusValues = data.rooms.map((room) => data.occupancyByRoom[room.id] ?? "available");
    return {
      total: data.rooms.length,
      available: statusValues.filter((status) => status === "available").length,
      occupied: statusValues.filter((status) => status === "occupied" || status === "reserved").length,
      unavailable: statusValues.filter((status) => ["blocked", "maintenance", "inactive"].includes(status)).length,
    };
  }, [data.occupancyByRoom, data.rooms]);

  const filteredRooms = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return data.rooms.filter((room) => {
      const status = data.occupancyByRoom[room.id] ?? "available";
      const searchable = [room.number, room.name, room.floor, room.room_types?.name].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
      return (!term || searchable.includes(term)) && (statusFilter === "all" || status === statusFilter) && (typeFilter === "all" || room.room_type_id === typeFilter);
    });
  }, [data.occupancyByRoom, data.rooms, search, statusFilter, typeFilter]);

  const activeBlocks = data.blocks.filter((block) => ["scheduled", "active"].includes(block.status));
  const calendarDays = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(new Date(), index)), []);

  function notify(result: RoomActionResult) {
    setToast({ message: result.message, ok: result.ok });
    if (result.ok) {
      setModal(null);
      router.refresh();
    }
  }

  function primaryAction() {
    if (!canManageRooms) return;
    if (tab === "types" && canManageTypes) setModal({ kind: "type" });
    else if (tab === "blocks") setModal({ kind: "block" });
    else setModal({ kind: "room" });
  }

  const actionLabel = tab === "types" ? "Novo tipo" : tab === "blocks" ? "Novo bloqueio" : "Novo quarto";
  const showPrimaryAction = canManageRooms && tab !== "calendar" && (tab !== "types" || canManageTypes);

  return (
    <Page>
      <PageHeader>
        <div>
          <Eyebrow><Sparkles size={14} /> Gestão de acomodações</Eyebrow>
          <h2>Quartos e disponibilidade</h2>
          <p>Organize as acomodações, acompanhe a ocupação e programe indisponibilidades.</p>
        </div>
        {showPrimaryAction && <PrimaryButton type="button" onClick={primaryAction}><Plus size={18} /> {actionLabel}</PrimaryButton>}
      </PageHeader>

      {data.warnings.map((warning) => <Warning key={warning}><AlertCircle size={17} /><span>{warning}</span></Warning>)}

      <StatsGrid>
        <StatCard $tone="primary"><StatIcon $tone="primary"><BedDouble size={21} /></StatIcon><div><span>Total de quartos</span><strong>{stats.total}</strong><small>{plural(data.roomTypes.length, "tipo cadastrado", "tipos cadastrados")}</small></div></StatCard>
        <StatCard $tone="success"><StatIcon $tone="success"><Check size={21} /></StatIcon><div><span>Livres agora</span><strong>{stats.available}</strong><small>Prontos para novas reservas</small></div></StatCard>
        <StatCard $tone="warning"><StatIcon $tone="warning"><Users size={21} /></StatIcon><div><span>Ocupados / reservados</span><strong>{stats.occupied}</strong><small>Situação calculada pelas reservas</small></div></StatCard>
        <StatCard $tone="purple"><StatIcon $tone="purple"><Wrench size={21} /></StatIcon><div><span>Indisponíveis</span><strong>{stats.unavailable}</strong><small>{plural(activeBlocks.length, "bloqueio vigente", "bloqueios vigentes")}</small></div></StatCard>
      </StatsGrid>

      <Panel>
        <Tabs role="tablist" aria-label="Áreas do módulo de quartos">
          <TabButton $active={tab === "rooms"} type="button" role="tab" aria-selected={tab === "rooms"} onClick={() => setTab("rooms")}><BedDouble size={17} /> Mapa de quartos</TabButton>
          <TabButton $active={tab === "calendar"} type="button" role="tab" aria-selected={tab === "calendar"} onClick={() => setTab("calendar")}><CalendarDays size={17} /> Calendário</TabButton>
          <TabButton $active={tab === "types"} type="button" role="tab" aria-selected={tab === "types"} onClick={() => setTab("types")}><Layers3 size={17} /> Tipos</TabButton>
          <TabButton $active={tab === "blocks"} type="button" role="tab" aria-selected={tab === "blocks"} onClick={() => setTab("blocks")}><LockKeyhole size={17} /> Bloqueios</TabButton>
        </Tabs>

        {tab === "rooms" && (
          <Section>
            <Toolbar>
              <SearchBox><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por número, nome, tipo ou andar" aria-label="Buscar quartos" />{search && <ClearButton type="button" aria-label="Limpar busca" onClick={() => setSearch("")}><X size={16} /></ClearButton>}</SearchBox>
              <FilterBox><Filter size={17} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por situação"><option value="all">Todas as situações</option>{Object.entries(occupancyMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></FilterBox>
              <FilterBox><Layers3 size={17} /><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrar por tipo"><option value="all">Todos os tipos</option>{data.roomTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></FilterBox>
            </Toolbar>

            {filteredRooms.length ? (
              <RoomsGrid>{filteredRooms.map((room) => <RoomCard key={room.id} room={room} status={data.occupancyByRoom[room.id] ?? "available"} canManage={canManageRooms} onDetails={() => setModal({ kind: "details", value: room })} onEdit={() => setModal({ kind: "room", value: room })} onBlock={() => setModal({ kind: "block", roomId: room.id })} />)}</RoomsGrid>
            ) : (
              <EmptyState><Search size={25} /><h3>Nenhum quarto encontrado</h3><p>Ajuste os filtros ou cadastre uma nova acomodação para este hotel.</p>{canManageRooms && <SecondaryButton type="button" onClick={() => setModal({ kind: "room" })}><Plus size={17} /> Cadastrar quarto</SecondaryButton>}</EmptyState>
            )}
          </Section>
        )}

        {tab === "calendar" && <CalendarView rooms={data.rooms} days={calendarDays} events={data.calendarEvents} />}

        {tab === "types" && (
          <Section>
            <SectionHeading><div><h3>Tipos de quarto</h3><p>Modelos que agilizam o cadastro de novas acomodações.</p></div>{canManageTypes && <SecondaryButton type="button" onClick={() => setModal({ kind: "type" })}><Plus size={17} /> Novo tipo</SecondaryButton>}</SectionHeading>
            {data.roomTypes.length ? <TypesGrid>{data.roomTypes.map((type) => {
              const count = data.rooms.filter((room) => room.room_type_id === type.id).length;
              return <TypeCard key={type.id}><TypeCardTop><TypeIcon><Layers3 size={19} /></TypeIcon><StatusBadge $tone={type.is_active ? "success" : "neutral"}>{type.is_active ? "Ativo" : "Inativo"}</StatusBadge></TypeCardTop><h4>{type.name}</h4><p>{type.description || "Sem descrição informada."}</p><TypeDetails><span><Users size={16} /> Até {plural(type.default_capacity, "hóspede", "hóspedes")}</span><span><CircleDollarSign size={16} /> {currency.format(type.default_daily_rate)}</span><span><BedDouble size={16} /> {plural(count, "quarto", "quartos")}</span></TypeDetails>{canManageTypes && <CardActions><GhostButton type="button" onClick={() => setModal({ kind: "type", value: type })}><Edit3 size={16} /> Editar</GhostButton><IconAction type="button" aria-label={`Excluir tipo ${type.name}`} onClick={() => setModal({ kind: "delete-type", value: type })}><Trash2 size={16} /></IconAction></CardActions>}</TypeCard>;
            })}</TypesGrid> : <EmptyState><Layers3 size={25} /><h3>Crie o primeiro tipo de quarto</h3><p>Defina capacidade e diária sugeridas para tornar os próximos cadastros mais rápidos.</p>{canManageTypes && <SecondaryButton type="button" onClick={() => setModal({ kind: "type" })}><Plus size={17} /> Criar tipo</SecondaryButton>}</EmptyState>}
          </Section>
        )}

        {tab === "blocks" && (
          <Section>
            <SectionHeading><div><h3>Bloqueios e manutenções</h3><p>Períodos em que um quarto não pode receber novas reservas.</p></div>{canManageRooms && <SecondaryButton type="button" onClick={() => setModal({ kind: "block" })}><Plus size={17} /> Novo bloqueio</SecondaryButton>}</SectionHeading>
            {data.blocks.length ? <BlocksList>{data.blocks.map((block) => <BlockItem key={block.id}><BlockIcon $cancelled={block.status === "cancelled"}>{block.block_type === "maintenance" || block.block_type === "renovation" ? <Wrench size={19} /> : <LockKeyhole size={19} />}</BlockIcon><BlockMain><div><strong>Quarto {block.rooms?.number ?? "—"}</strong><StatusBadge $tone={block.status === "active" ? "danger" : block.status === "scheduled" ? "warning" : block.status === "completed" ? "success" : "neutral"}>{blockStatusLabels[block.status]}</StatusBadge></div><span>{blockTypeLabels[block.block_type]} · {block.reason}</span><small><Clock3 size={14} /> {dateTime.format(new Date(block.start_at))} até {dateTime.format(new Date(block.end_at))}</small></BlockMain>{canManageRooms && ["scheduled", "active"].includes(block.status) && <BlockActions><GhostButton type="button" onClick={() => setModal({ kind: "block", value: block })}><Edit3 size={16} /> Editar</GhostButton><GhostButton $danger type="button" onClick={() => setModal({ kind: "cancel-block", value: block })}><X size={16} /> Cancelar</GhostButton></BlockActions>}</BlockItem>)}</BlocksList> : <EmptyState><LockKeyhole size={25} /><h3>Nenhum bloqueio cadastrado</h3><p>Quando necessário, programe limpezas, reformas, manutenções ou uso interno.</p></EmptyState>}
          </Section>
        )}
      </Panel>

      {modal && <Modal modal={modal} data={data} canManageTypes={canManageTypes} onClose={() => setModal(null)} onChange={setModal} onResult={notify} />}
      {toast && <Toast role="status" $ok={toast.ok}><span>{toast.ok ? <Check size={18} /> : <AlertCircle size={18} />}</span><p>{toast.message}</p><button type="button" aria-label="Fechar mensagem" onClick={() => setToast(null)}><X size={16} /></button></Toast>}
    </Page>
  );
}

function RoomCard({ room, status, canManage, onDetails, onEdit, onBlock }: { room: RoomRow; status: RoomOccupancyStatus; canManage: boolean; onDetails: () => void; onEdit: () => void; onBlock: () => void }) {
  const meta = occupancyMeta[status];
  return (
    <RoomCardBox $tone={meta.tone}>
      <RoomCardHeader><RoomNumber><small>Quarto</small><strong>{room.number}</strong></RoomNumber><StatusBadge $tone={meta.tone}><StatusDot />{meta.label}</StatusBadge></RoomCardHeader>
      <RoomName>{room.name || room.room_types?.name || "Acomodação"}</RoomName>
      <RoomMeta><span><Layers3 size={15} /> {room.room_types?.name ?? "Sem tipo"}</span><span><Users size={15} /> {plural(room.capacity, "pessoa", "pessoas")}</span>{room.floor && <span><Building2 size={15} /> {room.floor}</span>}</RoomMeta>
      <Rate><span>Diária padrão</span><strong>{currency.format(room.default_daily_rate)}</strong></Rate>
      <CardFooter><GhostButton type="button" onClick={onDetails}><Eye size={16} /> Detalhes</GhostButton>{canManage && <MenuWrap><IconAction type="button" aria-label={`Editar quarto ${room.number}`} onClick={onEdit}><Edit3 size={16} /></IconAction>{status !== "inactive" && <IconAction type="button" aria-label={`Bloquear quarto ${room.number}`} onClick={onBlock}><LockKeyhole size={16} /></IconAction>}</MenuWrap>}</CardFooter>
    </RoomCardBox>
  );
}

function CalendarView({ rooms, days, events }: { rooms: RoomRow[]; days: Date[]; events: RoomsModuleData["calendarEvents"] }) {
  return (
    <Section>
      <SectionHeading><div><h3>Ocupação dos próximos 14 dias</h3><p>Reservas usam o intervalo entre entrada e saída; a data de checkout não ocupa uma nova diária.</p></div><CalendarLegend><span><i data-kind="reservation" /> Reserva</span><span><i data-kind="block" /> Bloqueio</span></CalendarLegend></SectionHeading>
      {rooms.length ? <CalendarScroll><CalendarGrid>
        <CalendarCorner>Quarto</CalendarCorner>{days.map((day) => <CalendarDay key={dateKey(day)} $today={dateKey(day) === dateKey(new Date())}><small>{day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</small><strong>{day.getDate()}</strong></CalendarDay>)}
        {rooms.map((room) => <CalendarRow key={room.id} room={room} days={days} events={events.filter((event) => event.room_id === room.id)} />)}
      </CalendarGrid></CalendarScroll> : <EmptyState><CalendarDays size={25} /><h3>Cadastre quartos para visualizar o calendário</h3><p>A linha do tempo aparecerá aqui assim que existirem acomodações.</p></EmptyState>}
    </Section>
  );
}

function CalendarRow({ room, days, events }: { room: RoomRow; days: Date[]; events: RoomsModuleData["calendarEvents"] }) {
  return <><CalendarRoom><strong>{room.number}</strong><span>{room.room_types?.name ?? "Sem tipo"}</span></CalendarRoom>{days.map((day) => {
    const key = dateKey(day);
    const event = events.find((item) => key >= item.start_date && key < item.end_date) ?? events.find((item) => item.kind === "block" && key === item.end_date);
    return <CalendarCell key={`${room.id}-${key}`} $kind={event?.kind} title={event ? `${event.label} · ${event.status}` : "Livre"}>{event && <EventPill $kind={event.kind}>{event.kind === "block" ? <LockKeyhole size={12} /> : <BedDouble size={12} />}<span>{event.label}</span></EventPill>}</CalendarCell>;
  })}</>;
}

function Modal({ modal, data, canManageTypes, onClose, onChange, onResult }: { modal: ModalState; data: RoomsModuleData; canManageTypes: boolean; onClose: () => void; onChange: (value: ModalState) => void; onResult: (result: RoomActionResult) => void }) {
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [onClose]);

  function submit(action: (formData: FormData) => Promise<RoomActionResult>) {
    return (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(async () => {
        const result = await action(formData);
        setFieldErrors(result.fieldErrors ?? {});
        onResult(result);
      });
    };
  }

  function run(action: () => Promise<RoomActionResult>) {
    startTransition(async () => onResult(await action()));
  }

  let content: React.ReactNode;
  let title = "";
  let subtitle = "";
  let wide = false;

  if (modal.kind === "room") {
    const room = modal.value;
    title = room ? `Editar quarto ${room.number}` : "Cadastrar novo quarto";
    subtitle = "Informe os dados operacionais e comerciais da acomodação.";
    wide = true;
    content = <form onSubmit={submit(saveRoomAction)}><input type="hidden" name="id" value={room?.id ?? ""} /><FormGrid><Field><label htmlFor="room-number">Número / identificação *</label><input id="room-number" name="number" defaultValue={room?.number ?? ""} placeholder="Ex.: 101" autoFocus aria-invalid={Boolean(fieldErrors.number)} />{fieldErrors.number && <FieldError>{fieldErrors.number}</FieldError>}</Field><Field><label htmlFor="room-name">Nome complementar</label><input id="room-name" name="name" defaultValue={room?.name ?? ""} placeholder="Ex.: Suíte Jardim" /></Field><Field><label htmlFor="room-type">Tipo do quarto *</label><select id="room-type" name="room_type_id" defaultValue={room?.room_type_id ?? ""} aria-invalid={Boolean(fieldErrors.room_type_id)} onChange={(event) => {
      if (room) return;
      const type = data.roomTypes.find((item) => item.id === event.target.value);
      const form = event.currentTarget.form;
      if (type && form) { (form.elements.namedItem("capacity") as HTMLInputElement).value = String(type.default_capacity); (form.elements.namedItem("default_daily_rate") as HTMLInputElement).value = String(type.default_daily_rate); }
    }}><option value="">Selecione</option>{data.roomTypes.filter((type) => type.is_active || type.id === room?.room_type_id).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>{fieldErrors.room_type_id && <FieldError>{fieldErrors.room_type_id}</FieldError>}{!data.roomTypes.length && canManageTypes && <FieldHint>Primeiro crie um tipo de quarto na aba “Tipos”.</FieldHint>}</Field><Field><label htmlFor="room-floor">Andar ou setor</label><input id="room-floor" name="floor" defaultValue={room?.floor ?? ""} placeholder="Ex.: 1º andar" /></Field><Field><label htmlFor="room-capacity">Capacidade *</label><input id="room-capacity" name="capacity" type="number" min="1" step="1" defaultValue={room?.capacity ?? 1} aria-invalid={Boolean(fieldErrors.capacity)} />{fieldErrors.capacity && <FieldError>{fieldErrors.capacity}</FieldError>}</Field><Field><label htmlFor="room-rate">Diária padrão *</label><MoneyInput><span>R$</span><input id="room-rate" name="default_daily_rate" type="number" min="0" step="0.01" defaultValue={room?.default_daily_rate ?? 0} aria-invalid={Boolean(fieldErrors.default_daily_rate)} /></MoneyInput>{fieldErrors.default_daily_rate && <FieldError>{fieldErrors.default_daily_rate}</FieldError>}</Field><Field $full><label htmlFor="room-status">Situação operacional *</label><select id="room-status" name="operational_status" defaultValue={room?.operational_status ?? "active"}><option value="active">Ativo</option><option value="maintenance">Em manutenção</option><option value="inactive">Inativo</option></select><FieldHint>Reservas futuras não mudam esta situação. Ocupação é calculada separadamente.</FieldHint></Field><Field $full><label htmlFor="room-notes">Observações internas</label><textarea id="room-notes" name="notes" rows={3} defaultValue={room?.notes ?? ""} placeholder="Informações úteis para a equipe" /></Field></FormGrid><ModalFooter><SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={isPending || !data.roomTypes.length}>{isPending ? "Salvando..." : room ? "Salvar alterações" : "Cadastrar quarto"}</PrimaryButton></ModalFooter></form>;
  } else if (modal.kind === "type") {
    const type = modal.value;
    title = type ? `Editar ${type.name}` : "Novo tipo de quarto";
    subtitle = "Crie um modelo com capacidade e diária sugeridas.";
    content = <form onSubmit={submit(saveRoomTypeAction)}><input type="hidden" name="id" value={type?.id ?? ""} /><FormGrid><Field $full><label htmlFor="type-name">Nome do tipo *</label><input id="type-name" name="name" defaultValue={type?.name ?? ""} placeholder="Ex.: Suíte casal" autoFocus aria-invalid={Boolean(fieldErrors.name)} />{fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}</Field><Field><label htmlFor="type-capacity">Capacidade sugerida *</label><input id="type-capacity" name="default_capacity" type="number" min="1" step="1" defaultValue={type?.default_capacity ?? 1} />{fieldErrors.default_capacity && <FieldError>{fieldErrors.default_capacity}</FieldError>}</Field><Field><label htmlFor="type-rate">Diária sugerida *</label><MoneyInput><span>R$</span><input id="type-rate" name="default_daily_rate" type="number" min="0" step="0.01" defaultValue={type?.default_daily_rate ?? 0} /></MoneyInput>{fieldErrors.default_daily_rate && <FieldError>{fieldErrors.default_daily_rate}</FieldError>}</Field><Field $full><label htmlFor="type-description">Descrição</label><textarea id="type-description" name="description" rows={3} defaultValue={type?.description ?? ""} placeholder="Características principais deste tipo" /></Field><Field $full><label htmlFor="type-active">Disponibilidade do tipo</label><select id="type-active" name="is_active" defaultValue={String(type?.is_active ?? true)}><option value="true">Ativo para novos cadastros</option><option value="false">Inativo</option></select></Field></FormGrid><ModalFooter><SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={isPending}>{isPending ? "Salvando..." : type ? "Salvar alterações" : "Criar tipo"}</PrimaryButton></ModalFooter></form>;
  } else if (modal.kind === "block") {
    const block = modal.value;
    const selectedRoomId = block?.room_id ?? modal.roomId ?? "";
    title = block ? "Editar bloqueio" : "Programar bloqueio";
    subtitle = "O quarto ficará indisponível para novas reservas durante o período.";
    wide = true;
    content = <form onSubmit={submit(saveRoomBlockAction)}><input type="hidden" name="id" value={block?.id ?? ""} /><FormGrid><Field><label htmlFor="block-room">Quarto *</label><select id="block-room" name="room_id" defaultValue={selectedRoomId} disabled={Boolean(block)} aria-invalid={Boolean(fieldErrors.room_id)}><option value="">Selecione</option>{data.rooms.filter((room) => room.operational_status !== "inactive" || room.id === selectedRoomId).map((room) => <option key={room.id} value={room.id}>Quarto {room.number} · {room.room_types?.name ?? "Sem tipo"}</option>)}</select>{block && <input type="hidden" name="room_id" value={block.room_id} />}{fieldErrors.room_id && <FieldError>{fieldErrors.room_id}</FieldError>}{block && <FieldHint>Para trocar o quarto, cancele este bloqueio e crie outro.</FieldHint>}</Field><Field><label htmlFor="block-type">Tipo *</label><select id="block-type" name="block_type" defaultValue={block?.block_type ?? "maintenance"}>{Object.entries(blockTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field><label htmlFor="block-start">Início *</label><input id="block-start" name="start_at" type="datetime-local" defaultValue={toLocalInput(block?.start_at)} aria-invalid={Boolean(fieldErrors.start_at)} />{fieldErrors.start_at && <FieldError>{fieldErrors.start_at}</FieldError>}</Field><Field><label htmlFor="block-end">Fim *</label><input id="block-end" name="end_at" type="datetime-local" defaultValue={toLocalInput(block?.end_at)} aria-invalid={Boolean(fieldErrors.end_at)} />{fieldErrors.end_at && <FieldError>{fieldErrors.end_at}</FieldError>}</Field><Field $full><label htmlFor="block-reason">Motivo *</label><input id="block-reason" name="reason" defaultValue={block?.reason ?? ""} placeholder="Ex.: Reparo no ar-condicionado" aria-invalid={Boolean(fieldErrors.reason)} />{fieldErrors.reason && <FieldError>{fieldErrors.reason}</FieldError>}</Field><Field $full><label htmlFor="block-notes">Observações internas</label><textarea id="block-notes" name="notes" rows={3} defaultValue={block?.notes ?? ""} placeholder="Detalhes para a equipe" /></Field></FormGrid><InfoBox><ShieldAlert size={17} /><span>O sistema impedirá períodos sobrepostos e bloqueios que conflitem com reservas ativas.</span></InfoBox><ModalFooter><SecondaryButton type="button" onClick={onClose}>Cancelar</SecondaryButton><PrimaryButton type="submit" disabled={isPending || !data.rooms.length}>{isPending ? "Salvando..." : block ? "Salvar alterações" : "Criar bloqueio"}</PrimaryButton></ModalFooter></form>;
  } else if (modal.kind === "details") {
    const room = modal.value;
    const status = data.occupancyByRoom[room.id] ?? "available";
    const roomBlocks = data.blocks.filter((block) => block.room_id === room.id && ["scheduled", "active"].includes(block.status));
    title = `Quarto ${room.number}`;
    subtitle = occupancyMeta[status].description;
    content = <Details><DetailHero $tone={occupancyMeta[status].tone}><BedDouble size={28} /><div><strong>{room.name || room.room_types?.name || "Acomodação"}</strong><StatusBadge $tone={occupancyMeta[status].tone}>{occupancyMeta[status].label}</StatusBadge></div></DetailHero><DetailGrid><DetailItem><span>Tipo</span><strong>{room.room_types?.name ?? "Não informado"}</strong></DetailItem><DetailItem><span>Capacidade</span><strong>{plural(room.capacity, "hóspede", "hóspedes")}</strong></DetailItem><DetailItem><span>Andar / setor</span><strong>{room.floor || "Não informado"}</strong></DetailItem><DetailItem><span>Diária padrão</span><strong>{currency.format(room.default_daily_rate)}</strong></DetailItem><DetailItem><span>Situação operacional</span><strong>{operationalLabels[room.operational_status]}</strong></DetailItem><DetailItem><span>Bloqueios vigentes</span><strong>{roomBlocks.length}</strong></DetailItem></DetailGrid>{room.notes && <Notes><span>Observações internas</span><p>{room.notes}</p></Notes>}<ModalFooter><SecondaryButton type="button" onClick={onClose}>Fechar</SecondaryButton>{canManageTypes && <DangerTextButton type="button" onClick={() => onChange({ kind: "delete-room", value: room })}><Trash2 size={16} /> Excluir</DangerTextButton>}<PrimaryButton type="button" onClick={() => onChange({ kind: "room", value: room })}><Edit3 size={16} /> Editar quarto</PrimaryButton></ModalFooter></Details>;
  } else if (modal.kind === "delete-room") {
    const room = modal.value;
    title = `Excluir quarto ${room.number}?`;
    subtitle = "Esta ação só será concluída se o quarto não possuir histórico vinculado.";
    content = <ConfirmContent><ConfirmIcon><Trash2 size={23} /></ConfirmIcon><p>Recomendamos inativar cadastros com histórico para preservar as informações do hotel.</p><ModalFooter><SecondaryButton type="button" onClick={onClose}>Voltar</SecondaryButton><DangerButton type="button" disabled={isPending} onClick={() => run(() => deleteRoomAction(room.id))}>{isPending ? "Processando..." : "Sim, excluir"}</DangerButton></ModalFooter></ConfirmContent>;
  } else if (modal.kind === "delete-type") {
    const type = modal.value;
    title = `Excluir tipo ${type.name}?`;
    subtitle = "Tipos utilizados por quartos não podem ser excluídos.";
    content = <ConfirmContent><ConfirmIcon><Trash2 size={23} /></ConfirmIcon><p>Recomendamos inativar cadastros com histórico para preservar as informações do hotel.</p><ModalFooter><SecondaryButton type="button" onClick={onClose}>Voltar</SecondaryButton><DangerButton type="button" disabled={isPending} onClick={() => run(() => deleteRoomTypeAction(type.id))}>{isPending ? "Processando..." : "Sim, excluir"}</DangerButton></ModalFooter></ConfirmContent>;
  } else {
    const block = modal.value;
    title = "Cancelar bloqueio?";
    subtitle = "O período voltará a ficar disponível, desde que não exista outra indisponibilidade.";
    content = <ConfirmContent><ConfirmIcon><Trash2 size={23} /></ConfirmIcon><p>{`Bloqueio do quarto ${block.rooms?.number ?? "selecionado"}: ${block.reason}`}</p><ModalFooter><SecondaryButton type="button" onClick={onClose}>Voltar</SecondaryButton><DangerButton type="button" disabled={isPending} onClick={() => run(() => cancelRoomBlockAction(block.id))}>{isPending ? "Processando..." : "Sim, cancelar bloqueio"}</DangerButton></ModalFooter></ConfirmContent>;
  }

  return <ModalOverlay onMouseDown={(event) => event.target === event.currentTarget && onClose()}><Dialog role="dialog" aria-modal="true" aria-labelledby="room-modal-title" $wide={wide}><ModalHeader><div><h2 id="room-modal-title">{title}</h2><p>{subtitle}</p></div><ModalClose type="button" aria-label="Fechar" onClick={onClose}><X size={19} /></ModalClose></ModalHeader><ModalBody>{content}</ModalBody></Dialog></ModalOverlay>;
}

type Tone = "primary" | "success" | "warning" | "danger" | "purple" | "neutral";
const toneStyles = css<{ $tone: Tone }>`
  ${({ theme, $tone }) => {
    const tones = {
      primary: [theme.colors.primarySoft, theme.colors.primary], success: [theme.colors.successSoft, theme.colors.success], warning: [theme.colors.warningSoft, theme.colors.warning], danger: [theme.colors.dangerSoft, theme.colors.danger], purple: [theme.colors.purpleSoft, theme.colors.purple], neutral: [theme.colors.surfaceSoft, theme.colors.muted],
    } as const;
    return css`background: ${tones[$tone][0]}; color: ${tones[$tone][1]};`;
  }}
`;

const Page = styled.main`display: grid; gap: 22px;`;
const PageHeader = styled.header`display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; h2 { margin: 7px 0 7px; font-size: clamp(24px, 3vw, 30px); letter-spacing: -0.045em; } p { margin: 0; color: ${({ theme }) => theme.colors.textSoft}; font-size: 14px; line-height: 1.6; } @media (max-width: 650px) { align-items: stretch; flex-direction: column; }`;
const Eyebrow = styled.span`display: inline-flex; align-items: center; gap: 7px; color: ${({ theme }) => theme.colors.primary}; font-size: 12px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase;`;
const buttonBase = css`display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 44px; padding: 0 17px; border-radius: 12px; font-size: 13px; font-weight: 800; transition: 180ms ease; &:disabled { cursor: not-allowed; opacity: .55; }`;
const PrimaryButton = styled.button`${buttonBase}; border: 0; background: ${({ theme }) => theme.colors.primary}; color: white; box-shadow: 0 12px 26px rgba(67, 76, 228, .2); &:not(:disabled):hover { transform: translateY(-1px); filter: brightness(.97); }`;
const SecondaryButton = styled.button`${buttonBase}; border: 1px solid ${({ theme }) => theme.colors.border}; background: ${({ theme }) => theme.colors.surface}; color: ${({ theme }) => theme.colors.text}; &:not(:disabled):hover { border-color: ${({ theme }) => theme.colors.borderStrong}; background: ${({ theme }) => theme.colors.surfaceSoft}; }`;
const Warning = styled.div`display: flex; align-items: center; gap: 10px; padding: 13px 15px; border: 1px solid ${({ theme }) => theme.colors.warningSoft}; border-radius: 12px; background: ${({ theme }) => theme.colors.warningSoft}; color: #8a5a00; font-size: 13px; font-weight: 650;`;
const StatsGrid = styled.section`display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; @media (max-width: 1120px) { grid-template-columns: repeat(2, 1fr); } @media (max-width: 560px) { grid-template-columns: 1fr; }`;
const StatCard = styled.article<{ $tone: Tone }>`display: flex; align-items: center; gap: 14px; min-width: 0; padding: 18px; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; background: ${({ theme }) => theme.colors.surface}; box-shadow: ${({ theme }) => theme.shadow.card}; div:last-child { display: grid; min-width: 0; gap: 2px; } span { color: ${({ theme }) => theme.colors.textSoft}; font-size: 12px; font-weight: 700; } strong { font-size: 25px; letter-spacing: -.04em; } small { overflow: hidden; color: ${({ theme }) => theme.colors.muted}; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }`;
const StatIcon = styled.div<{ $tone: Tone }>`${toneStyles}; flex: 0 0 auto; display: grid; width: 45px; height: 45px; place-items: center; border-radius: 12px;`;
const Panel = styled.section`overflow: hidden; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; background: ${({ theme }) => theme.colors.surface}; box-shadow: ${({ theme }) => theme.shadow.card};`;
const Tabs = styled.div`display: flex; gap: 5px; overflow-x: auto; padding: 10px 12px; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; scrollbar-width: none;`;
const TabButton = styled.button<{ $active: boolean }>`display: inline-flex; flex: 0 0 auto; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border: 0; border-radius: 12px; background: ${({ $active, theme }) => $active ? theme.colors.primarySoft : "transparent"}; color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textSoft}; font-size: 13px; font-weight: 800; &:hover { background: ${({ theme }) => theme.colors.surfaceSoft}; }`;
const Section = styled.div`display: grid; gap: 20px; padding: 22px; @media (max-width: 600px) { padding: 16px; }`;
const Toolbar = styled.div`display: grid; grid-template-columns: minmax(250px, 1fr) auto auto; gap: 10px; @media (max-width: 860px) { grid-template-columns: 1fr 1fr; > :first-child { grid-column: 1 / -1; } } @media (max-width: 560px) { grid-template-columns: 1fr; > :first-child { grid-column: auto; } }`;
const controlStyles = css`min-height: 44px; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; background: ${({ theme }) => theme.colors.surfaceSoft}; color: ${({ theme }) => theme.colors.text}; outline: none; &:focus-within { border-color: ${({ theme }) => theme.colors.primary}; box-shadow: 0 0 0 3px rgba(67, 76, 228, .1); }`;
const SearchBox = styled.div`${controlStyles}; display: flex; align-items: center; gap: 10px; padding: 0 13px; color: ${({ theme }) => theme.colors.muted}; input { width: 100%; border: 0; background: transparent; outline: 0; font-size: 13px; }`;
const ClearButton = styled.button`display: grid; width: 26px; height: 26px; place-items: center; border: 0; background: transparent; color: ${({ theme }) => theme.colors.muted};`;
const FilterBox = styled.div`${controlStyles}; display: flex; align-items: center; gap: 6px; padding-left: 12px; color: ${({ theme }) => theme.colors.muted}; select { min-width: 150px; height: 42px; padding: 0 32px 0 5px; border: 0; background: transparent; outline: none; color: ${({ theme }) => theme.colors.textSoft}; font-size: 12px; font-weight: 700; }`;
const RoomsGrid = styled.div`display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; @media (max-width: 1120px) { grid-template-columns: repeat(2, 1fr); } @media (max-width: 680px) { grid-template-columns: 1fr; }`;
const RoomCardBox = styled.article<{ $tone: Tone }>`position: relative; overflow: hidden; padding: 18px; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; background: ${({ theme }) => theme.colors.surface}; transition: 180ms ease; &::before { position: absolute; inset: 0 auto 0 0; width: 4px; content: ""; ${({ $tone, theme }) => ({ primary: theme.colors.primary, success: theme.colors.success, warning: theme.colors.warning, danger: theme.colors.danger, purple: theme.colors.purple, neutral: theme.colors.muted }[$tone]) && css`background: ${{ primary: theme.colors.primary, success: theme.colors.success, warning: theme.colors.warning, danger: theme.colors.danger, purple: theme.colors.purple, neutral: theme.colors.muted }[$tone]};`} } &:hover { transform: translateY(-2px); box-shadow: ${({ theme }) => theme.shadow.hover}; }`;
const RoomCardHeader = styled.div`display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;`;
const RoomNumber = styled.div`display: grid; gap: 0; small { color: ${({ theme }) => theme.colors.muted}; font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; } strong { font-size: 26px; line-height: 1.15; letter-spacing: -.045em; }`;
const StatusBadge = styled.span<{ $tone: Tone }>`${toneStyles}; display: inline-flex; align-items: center; gap: 6px; width: fit-content; min-height: 26px; padding: 0 9px; border-radius: 12px; font-size: 10px; font-weight: 850; white-space: nowrap;`;
const StatusDot = styled.i`width: 6px; height: 6px; border-radius: 50%; background: currentColor;`;
const RoomName = styled.h3`margin: 15px 0 9px; font-size: 15px;`;
const RoomMeta = styled.div`display: flex; flex-wrap: wrap; gap: 7px 12px; min-height: 42px; color: ${({ theme }) => theme.colors.textSoft}; span { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 650; }`;
const Rate = styled.div`display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-top: 14px; padding: 12px; border-radius: 12px; background: ${({ theme }) => theme.colors.surfaceSoft}; span { color: ${({ theme }) => theme.colors.muted}; font-size: 10px; font-weight: 700; } strong { font-size: 14px; }`;
const CardFooter = styled.div`display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; padding-top: 14px; border-top: 1px solid ${({ theme }) => theme.colors.border};`;
const GhostButton = styled.button<{ $danger?: boolean }>`display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 0 8px; border: 0; border-radius: 10px; background: transparent; color: ${({ $danger, theme }) => $danger ? theme.colors.danger : theme.colors.textSoft}; font-size: 11px; font-weight: 800; &:hover { background: ${({ theme }) => theme.colors.surfaceSoft}; color: ${({ $danger, theme }) => $danger ? theme.colors.danger : theme.colors.primary}; }`;
const MenuWrap = styled.div`display: flex; gap: 5px;`;
const IconAction = styled.button`display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 10px; background: ${({ theme }) => theme.colors.surface}; color: ${({ theme }) => theme.colors.textSoft}; &:hover { border-color: ${({ theme }) => theme.colors.borderStrong}; color: ${({ theme }) => theme.colors.primary}; }`;
const EmptyState = styled.div`display: grid; justify-items: center; min-height: 270px; place-content: center; padding: 35px 18px; text-align: center; color: ${({ theme }) => theme.colors.muted}; h3 { margin: 15px 0 6px; color: ${({ theme }) => theme.colors.text}; font-size: 16px; } p { max-width: 430px; margin: 0 0 18px; font-size: 13px; line-height: 1.6; }`;
const SectionHeading = styled.div`display: flex; align-items: center; justify-content: space-between; gap: 18px; h3 { margin: 0 0 4px; font-size: 16px; } p { margin: 0; color: ${({ theme }) => theme.colors.textSoft}; font-size: 12px; line-height: 1.5; } @media (max-width: 650px) { align-items: stretch; flex-direction: column; }`;
const TypesGrid = styled.div`display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; @media (max-width: 1000px) { grid-template-columns: repeat(2, 1fr); } @media (max-width: 620px) { grid-template-columns: 1fr; }`;
const TypeCard = styled.article`display: grid; padding: 18px; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; h4 { margin: 15px 0 5px; font-size: 15px; } > p { min-height: 38px; margin: 0; color: ${({ theme }) => theme.colors.textSoft}; font-size: 11px; line-height: 1.55; }`;
const TypeCardTop = styled.div`display: flex; align-items: center; justify-content: space-between;`;
const TypeIcon = styled.div`display: grid; width: 39px; height: 39px; place-items: center; border-radius: 12px; background: ${({ theme }) => theme.colors.primarySoft}; color: ${({ theme }) => theme.colors.primary};`;
const TypeDetails = styled.div`display: grid; gap: 8px; margin: 15px 0; padding: 12px; border-radius: 12px; background: ${({ theme }) => theme.colors.surfaceSoft}; span { display: flex; align-items: center; gap: 8px; color: ${({ theme }) => theme.colors.textSoft}; font-size: 11px; font-weight: 650; }`;
const CardActions = styled.div`display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid ${({ theme }) => theme.colors.border};`;
const BlocksList = styled.div`display: grid; gap: 10px;`;
const BlockItem = styled.article`display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px; padding: 15px; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; @media (max-width: 720px) { grid-template-columns: auto 1fr; > :last-child { grid-column: 1 / -1; } }`;
const BlockIcon = styled.div<{ $cancelled: boolean }>`display: grid; width: 42px; height: 42px; place-items: center; border-radius: 12px; background: ${({ $cancelled, theme }) => $cancelled ? theme.colors.surfaceSoft : theme.colors.warningSoft}; color: ${({ $cancelled, theme }) => $cancelled ? theme.colors.muted : theme.colors.warning};`;
const BlockMain = styled.div`display: grid; gap: 4px; min-width: 0; > div { display: flex; align-items: center; gap: 9px; } > span { overflow: hidden; color: ${({ theme }) => theme.colors.textSoft}; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; } small { display: flex; align-items: center; gap: 6px; color: ${({ theme }) => theme.colors.muted}; font-size: 10px; }`;
const BlockActions = styled.div`display: flex; align-items: center; gap: 5px;`;
const CalendarLegend = styled.div`display: flex; gap: 14px; span { display: flex; align-items: center; gap: 6px; color: ${({ theme }) => theme.colors.textSoft}; font-size: 10px; font-weight: 700; } i { width: 9px; height: 9px; border-radius: 3px; background: ${({ theme }) => theme.colors.primary}; &[data-kind="block"] { background: ${({ theme }) => theme.colors.warning}; } }`;
const CalendarScroll = styled.div`overflow: auto; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px;`;
const CalendarGrid = styled.div`display: grid; grid-template-columns: 150px repeat(14, minmax(75px, 1fr)); min-width: 1200px;`;
const CalendarCorner = styled.div`position: sticky; left: 0; z-index: 3; display: flex; align-items: center; padding: 12px; border-right: 1px solid ${({ theme }) => theme.colors.border}; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; background: ${({ theme }) => theme.colors.surfaceSoft}; color: ${({ theme }) => theme.colors.textSoft}; font-size: 11px; font-weight: 800;`;
const CalendarDay = styled.div<{ $today: boolean }>`display: grid; justify-items: center; gap: 2px; padding: 10px 4px; border-right: 1px solid ${({ theme }) => theme.colors.border}; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; background: ${({ $today, theme }) => $today ? theme.colors.primarySoft : theme.colors.surfaceSoft}; small { color: ${({ theme }) => theme.colors.muted}; font-size: 9px; text-transform: uppercase; } strong { color: ${({ $today, theme }) => $today ? theme.colors.primary : theme.colors.text}; font-size: 13px; }`;
const CalendarRoom = styled.div`position: sticky; left: 0; z-index: 2; display: grid; align-content: center; padding: 10px 12px; border-right: 1px solid ${({ theme }) => theme.colors.border}; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; background: ${({ theme }) => theme.colors.surface}; strong { font-size: 12px; } span { color: ${({ theme }) => theme.colors.muted}; font-size: 9px; }`;
const CalendarCell = styled.div<{ $kind?: "reservation" | "block" }>`min-height: 54px; padding: 6px 3px; border-right: 1px solid ${({ theme }) => theme.colors.border}; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; background: ${({ $kind, theme }) => $kind === "reservation" ? "rgba(67,76,228,.035)" : $kind === "block" ? theme.colors.warningSoft : theme.colors.surface};`;
const EventPill = styled.div<{ $kind: "reservation" | "block" }>`display: flex; align-items: center; gap: 3px; overflow: hidden; width: 100%; padding: 5px; border-radius: 7px; background: ${({ $kind, theme }) => $kind === "reservation" ? theme.colors.primarySoft : theme.colors.warningSoft}; color: ${({ $kind, theme }) => $kind === "reservation" ? theme.colors.primary : theme.colors.warning}; font-size: 8px; font-weight: 800; span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`;
const ModalOverlay = styled.div`position: fixed; inset: 0; z-index: 100; display: grid; overflow-y: auto; place-items: center; padding: 20px; background: rgba(10, 18, 35, .48); backdrop-filter: blur(3px); @media (max-width: 560px) { align-items: end; padding: 0; }`;
const Dialog = styled.div<{ $wide: boolean }>`width: min(${({ $wide }) => $wide ? "760px" : "580px"}, 100%); max-height: min(90vh, 900px); overflow: hidden; border: 1px solid rgba(255,255,255,.7); border-radius: 12px; background: ${({ theme }) => theme.colors.surface}; box-shadow: 0 30px 90px rgba(15,23,42,.25); @media (max-width: 560px) { width: 100%; max-height: 94vh; border-radius: 12px 12px 0 0; }`;
const ModalHeader = styled.header`display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 21px 22px 18px; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; h2 { margin: 0 0 5px; font-size: 18px; letter-spacing: -.03em; } p { margin: 0; color: ${({ theme }) => theme.colors.textSoft}; font-size: 12px; line-height: 1.5; }`;
const ModalClose = styled.button`display: grid; flex: 0 0 auto; width: 36px; height: 36px; place-items: center; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; background: ${({ theme }) => theme.colors.surfaceSoft}; color: ${({ theme }) => theme.colors.textSoft};`;
const ModalBody = styled.div`max-height: calc(90vh - 92px); overflow-y: auto; padding: 21px 22px; @media (max-width: 560px) { max-height: calc(94vh - 92px); }`;
const FormGrid = styled.div`display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; @media (max-width: 600px) { grid-template-columns: 1fr; }`;
const Field = styled.div<{ $full?: boolean }>`display: grid; grid-column: ${({ $full }) => $full ? "1 / -1" : "auto"}; gap: 7px; label { color: ${({ theme }) => theme.colors.text}; font-size: 11px; font-weight: 800; } input, select, textarea { width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; background: ${({ theme }) => theme.colors.surfaceSoft}; color: ${({ theme }) => theme.colors.text}; outline: none; font-size: 12px; font-weight: 600; resize: vertical; &:focus { border-color: ${({ theme }) => theme.colors.primary}; box-shadow: 0 0 0 3px rgba(67,76,228,.1); } &[aria-invalid="true"] { border-color: ${({ theme }) => theme.colors.danger}; } &:disabled { color: ${({ theme }) => theme.colors.muted}; cursor: not-allowed; } } textarea { padding-top: 12px; }`;
const FieldError = styled.small`color: ${({ theme }) => theme.colors.danger}; font-size: 10px; font-weight: 650;`;
const FieldHint = styled.small`color: ${({ theme }) => theme.colors.muted}; font-size: 9px; line-height: 1.5;`;
const MoneyInput = styled.div`position: relative; span { position: absolute; top: 50%; left: 12px; z-index: 1; transform: translateY(-50%); color: ${({ theme }) => theme.colors.muted}; font-size: 11px; font-weight: 800; } input { padding-left: 36px !important; }`;
const ModalFooter = styled.footer`display: flex; align-items: center; justify-content: flex-end; gap: 9px; margin-top: 22px; padding-top: 18px; border-top: 1px solid ${({ theme }) => theme.colors.border}; @media (max-width: 480px) { align-items: stretch; flex-direction: column-reverse; button { width: 100%; } }`;
const InfoBox = styled.div`display: flex; gap: 9px; margin-top: 16px; padding: 12px; border-radius: 12px; background: ${({ theme }) => theme.colors.primarySoft}; color: ${({ theme }) => theme.colors.primary}; font-size: 10px; font-weight: 650; line-height: 1.5; svg { flex: 0 0 auto; }`;
const Details = styled.div``;
const DetailHero = styled.div<{ $tone: Tone }>`${toneStyles}; display: flex; align-items: center; gap: 14px; padding: 17px; border-radius: 12px; > div { display: grid; gap: 5px; } > div > strong { color: ${({ theme }) => theme.colors.text}; font-size: 15px; }`;
const DetailGrid = styled.div`display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 14px; @media (max-width: 480px) { grid-template-columns: 1fr; }`;
const DetailItem = styled.div`display: grid; gap: 4px; padding: 13px; border-radius: 12px; background: ${({ theme }) => theme.colors.surfaceSoft}; span { color: ${({ theme }) => theme.colors.muted}; font-size: 9px; font-weight: 750; text-transform: uppercase; } strong { font-size: 12px; }`;
const Notes = styled.div`margin-top: 14px; padding: 14px; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: 12px; span { color: ${({ theme }) => theme.colors.muted}; font-size: 9px; font-weight: 750; text-transform: uppercase; } p { margin: 6px 0 0; color: ${({ theme }) => theme.colors.textSoft}; font-size: 11px; line-height: 1.6; white-space: pre-wrap; }`;
const DangerTextButton = styled.button`${buttonBase}; border: 0; background: transparent; color: ${({ theme }) => theme.colors.danger};`;
const DangerButton = styled.button`${buttonBase}; border: 0; background: ${({ theme }) => theme.colors.danger}; color: white;`;
const ConfirmContent = styled.div`text-align: center; > p { max-width: 430px; margin: 16px auto 0; color: ${({ theme }) => theme.colors.textSoft}; font-size: 12px; line-height: 1.65; }`;
const ConfirmIcon = styled.div`display: grid; width: 50px; height: 50px; margin: 0 auto; place-items: center; border-radius: 12px; background: ${({ theme }) => theme.colors.dangerSoft}; color: ${({ theme }) => theme.colors.danger};`;
const Toast = styled.div<{ $ok: boolean }>`position: fixed; right: 24px; bottom: 24px; z-index: 200; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; width: min(380px, calc(100vw - 32px)); padding: 13px; border: 1px solid ${({ $ok, theme }) => $ok ? theme.colors.successSoft : theme.colors.dangerSoft}; border-radius: 12px; background: ${({ theme }) => theme.colors.surface}; box-shadow: 0 24px 70px rgba(15,23,42,.18); > span { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 10px; background: ${({ $ok, theme }) => $ok ? theme.colors.successSoft : theme.colors.dangerSoft}; color: ${({ $ok, theme }) => $ok ? theme.colors.success : theme.colors.danger}; } p { margin: 0; font-size: 11px; font-weight: 700; line-height: 1.45; } button { display: grid; width: 28px; height: 28px; place-items: center; border: 0; background: transparent; color: ${({ theme }) => theme.colors.muted}; } @media (max-width: 520px) { right: 16px; bottom: 16px; }`;
