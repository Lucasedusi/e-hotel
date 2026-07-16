"use client";

import styled from "styled-components";
import {
  ArrowUpRight,
  BedDouble,
  CalendarCheck,
  CircleDollarSign,
  Users,
} from "lucide-react";

const kpis = [
  {
    title: "Quartos cadastrados",
    value: "24",
    detail: "18 disponíveis",
    icon: BedDouble,
    tone: "blue",
  },
  {
    title: "Reservas ativas",
    value: "37",
    detail: "+8 esta semana",
    icon: CalendarCheck,
    tone: "purple",
  },
  {
    title: "Hóspedes hoje",
    value: "42",
    detail: "12 check-ins",
    icon: Users,
    tone: "green",
  },
  {
    title: "Receita prevista",
    value: "R$ 18.420",
    detail: "mês atual",
    icon: CircleDollarSign,
    tone: "yellow",
  },
];

const reservations = [
  {
    guest: "Carlos Henrique",
    room: "Suíte 102",
    status: "Confirmada",
    date: "Hoje, 14:00",
  },
  {
    guest: "Empresa Almeida LTDA",
    room: "Múltiplos",
    status: "Empresarial",
    date: "Hoje, 18:30",
  },
  {
    guest: "Mariana Costa",
    room: "Quarto 205",
    status: "Pendente",
    date: "Amanhã, 09:00",
  },
];

export function DashboardHome() {
  return (
    <PageGrid>
      <HeroCard>
        <HeroContent>
          <Badge>Visão geral</Badge>
          <h2>Bem-vindo ao novo Hotel Manager</h2>
          <p>
            Esta é a base visual inicial da migração. O próximo passo será
            conectar os dados reais do Supabase.
          </p>
          <HeroActions>
            <button type="button">Nova reserva</button>
            <a href="/quartos">Ver quartos</a>
          </HeroActions>
        </HeroContent>

        <HeroPanel>
          <strong>Ocupação atual</strong>
          <OccupancyNumber>75%</OccupancyNumber>
          <ProgressBar>
            <span />
          </ProgressBar>
          <small>18 de 24 quartos disponíveis para operação.</small>
        </HeroPanel>
      </HeroCard>

      <KpiGrid>
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <KpiCard key={item.title} $tone={item.tone}>
              <IconBox $tone={item.tone}>
                <Icon size={21} />
              </IconBox>
              <KpiInfo>
                <span>{item.title}</span>
                <strong>{item.value}</strong>
                <small>
                  <ArrowUpRight size={13} />
                  {item.detail}
                </small>
              </KpiInfo>
            </KpiCard>
          );
        })}
      </KpiGrid>

      <ContentGrid>
        <ChartCard>
          <SectionHeader>
            <div>
              <span>Resumo financeiro</span>
              <h3>Receita mensal</h3>
            </div>
            <select defaultValue="30">
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>
          </SectionHeader>

          <FakeChart>
            <ChartTooltip>
              <span>Total</span>
              <strong>R$ 54.973,50</strong>
            </ChartTooltip>
            <LineSvg viewBox="0 0 720 250" preserveAspectRatio="none">
              <path d="M0 170 C60 190 92 118 150 152 C210 190 252 70 315 112 C382 160 420 52 482 80 C548 110 570 154 632 92 C672 58 695 68 720 42" />
            </LineSvg>
            <ChartMonths>
              <span>Jan</span>
              <span>Fev</span>
              <span>Mar</span>
              <span>Abr</span>
              <span>Mai</span>
              <span>Jun</span>
              <span>Jul</span>
              <span>Ago</span>
              <span>Set</span>
              <span>Out</span>
              <span>Nov</span>
              <span>Dez</span>
            </ChartMonths>
          </FakeChart>
        </ChartCard>

        <SideCard>
          <SectionHeader>
            <div>
              <span>Operação</span>
              <h3>Reservas recentes</h3>
            </div>
          </SectionHeader>

          <ReservationList>
            {reservations.map((item) => (
              <ReservationItem key={`${item.guest}-${item.room}`}>
                <div>
                  <strong>{item.guest}</strong>
                  <span>
                    {item.room} • {item.date}
                  </span>
                </div>
                <StatusBadge>{item.status}</StatusBadge>
              </ReservationItem>
            ))}
          </ReservationList>
        </SideCard>
      </ContentGrid>
    </PageGrid>
  );
}

const PageGrid = styled.div`
  display: grid;
  gap: 22px;
`;

const HeroCard = styled.section`
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 24px;
  padding: 28px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background:
    radial-gradient(
      circle at 82% 18%,
      rgba(36, 107, 254, 0.18),
      transparent 25%
    ),
    ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const HeroContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;

  h2 {
    max-width: 620px;
    margin: 14px 0 10px;
    font-size: clamp(28px, 4vw, 44px);
    line-height: 1.03;
    letter-spacing: -0.07em;
  }

  p {
    max-width: 620px;
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 15px;
    line-height: 1.7;
  }
`;

const Badge = styled.span`
  width: fit-content;
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 12px;
  font-weight: 900;
`;

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 24px;

  button,
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    padding: 0 20px;
    border-radius: ${({ theme }) => theme.radius.md};
    font-size: 13px;
    font-weight: 900;
  }

  button {
    border: 0;
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
    box-shadow: 0 14px 32px rgba(36, 107, 254, 0.25);
  }

  a {
    background: ${({ theme }) => theme.colors.surfaceSoft};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const HeroPanel = styled.div`
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 240px;
  padding: 22px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: linear-gradient(160deg, #246bfe, #0b2d66);
  color: #fff;
  overflow: hidden;
  position: relative;

  &::before {
    content: "";
    position: absolute;
    width: 220px;
    height: 220px;
    right: -80px;
    top: -80px;
    border-radius: ${({ theme }) => theme.radius.md};
    background: rgba(255, 255, 255, 0.13);
  }

  strong,
  small,
  div {
    position: relative;
  }

  strong {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.75);
  }

  small {
    margin-top: 12px;
    color: rgba(255, 255, 255, 0.72);
    line-height: 1.6;
  }
`;

const OccupancyNumber = styled.div`
  margin-top: 8px;
  font-size: 52px;
  font-weight: 950;
  letter-spacing: -0.08em;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 10px;
  margin-top: 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;

  span {
    display: block;
    width: 75%;
    height: 100%;
    border-radius: ${({ theme }) => theme.radius.md};
    background: #fff;
  }
`;

const KpiGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;

  @media (max-width: 1180px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const KpiCard = styled.article<{ $tone: string }>`
  display: flex;
  align-items: center;
  gap: 15px;
  min-height: 132px;
  padding: 20px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const IconBox = styled.div<{ $tone: string }>`
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};

  ${({ theme, $tone }) => {
    const tones = {
      blue: [theme.colors.primarySoft, theme.colors.primary],
      purple: [theme.colors.purpleSoft, theme.colors.purple],
      green: [theme.colors.successSoft, theme.colors.success],
      yellow: [theme.colors.warningSoft, theme.colors.warning],
    } as const;
    const [background, color] =
      tones[$tone as keyof typeof tones] ?? tones.blue;
    return `background: ${background}; color: ${color};`;
  }}
`;

const KpiInfo = styled.div`
  display: grid;
  gap: 5px;

  span {
    font-size: 12px;
    font-weight: 850;
    color: ${({ theme }) => theme.colors.muted};
  }

  strong {
    font-size: 24px;
    letter-spacing: -0.05em;
  }

  small {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: ${({ theme }) => theme.colors.success};
    font-size: 12px;
    font-weight: 850;
  }
`;

const ContentGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 20px;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const ChartCard = styled.article`
  min-height: 420px;
  padding: 22px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const SideCard = styled.article`
  padding: 22px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;

  span {
    display: block;
    margin-bottom: 3px;
    color: ${({ theme }) => theme.colors.muted};
    font-size: 12px;
    font-weight: 850;
  }

  h3 {
    margin: 0;
    font-size: 18px;
    letter-spacing: -0.04em;
  }

  select {
    height: 38px;
    padding: 0 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radius.md};
    background: ${({ theme }) => theme.colors.surfaceSoft};
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 12px;
    font-weight: 800;
  }
`;

const FakeChart = styled.div`
  position: relative;
  display: grid;
  align-items: end;
  min-height: 315px;
  padding-top: 42px;
  border-radius: ${({ theme }) => theme.radius.md};
  background:
    linear-gradient(to bottom, rgba(36, 107, 254, 0.08), transparent),
    repeating-linear-gradient(
      to right,
      transparent 0 58px,
      rgba(226, 232, 240, 0.8) 59px 60px
    );
  overflow: hidden;
`;

const ChartTooltip = styled.div`
  position: absolute;
  top: 34px;
  left: 50%;
  transform: translateX(-50%);
  width: 210px;
  padding: 15px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: #0b2d66;
  color: #fff;
  box-shadow: 0 20px 45px rgba(11, 45, 102, 0.26);

  span {
    display: block;
    color: rgba(255, 255, 255, 0.62);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 5px;
    font-size: 19px;
    letter-spacing: -0.04em;
  }
`;

const LineSvg = styled.svg`
  width: 100%;
  height: 250px;

  path {
    fill: none;
    stroke: ${({ theme }) => theme.colors.primary};
    stroke-width: 5;
    stroke-linecap: round;
  }
`;

const ChartMonths = styled.div`
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 8px;
  padding: 8px 14px 14px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 11px;
  font-weight: 800;
`;

const ReservationList = styled.div`
  display: grid;
  gap: 12px;
`;

const ReservationItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surfaceSoft};

  div {
    display: grid;
    gap: 4px;
  }

  strong {
    font-size: 13px;
  }

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 12px;
    font-weight: 700;
  }
`;

const StatusBadge = styled.span`
  flex: 0 0 auto;
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
  font-size: 11px;
  font-weight: 900;
`;
