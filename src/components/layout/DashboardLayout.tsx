"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import {
  BedDouble,
  Bell,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Home,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { AuthenticatedUserAccess, HotelRole } from "@/types/auth";

interface DashboardLayoutProps {
  children: React.ReactNode;
  access: AuthenticatedUserAccess;
}

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Quartos", href: "/quartos", icon: BedDouble },
  { label: "Reservas", href: "/reservas", icon: CalendarCheck },
  { label: "Histórico", href: "/historico", icon: ClipboardList },
  { label: "Financeiro", href: "/financeiro", icon: CircleDollarSign },
  {
    label: "Usuários",
    href: "/usuarios",
    icon: Users,
    roles: ["owner", "admin"] as HotelRole[],
  },
];

const roleLabels: Record<HotelRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  reception: "Recepção",
  finance: "Financeiro",
  viewer: "Consulta",
};

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function DashboardLayout({ children, access }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const visibleNavItems = useMemo(
    () =>
      navItems.filter(
        (item) => !item.roles || item.roles.includes(access.role),
      ),
    [access.role],
  );

  const pageTitle = useMemo(() => {
    const current = visibleNavItems.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
    return current?.label ?? "Hotel Manager";
  }, [pathname, visibleNavItems]);

  function closeMobileMenu() {
    setMobileOpen(false);
  }

  async function handleLogout() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    document.cookie =
      "e_hotel_selected_hotel=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/login");
    router.refresh();
  }

  return (
    <Shell>
      <MobileOverlay $open={mobileOpen} onClick={closeMobileMenu} />

      <Sidebar $collapsed={collapsed} $mobileOpen={mobileOpen}>
        <SidebarTop>
          <Brand
            $collapsed={collapsed}
            href="/dashboard"
            onClick={closeMobileMenu}
          >
            <BrandMark>HM</BrandMark>
            {!collapsed && (
              <BrandText>
                <strong>Hotel</strong>
                <span>Manager</span>
              </BrandText>
            )}
          </Brand>

          <MobileCloseButton
            type="button"
            aria-label="Fechar menu"
            onClick={closeMobileMenu}
          >
            <X size={18} />
          </MobileCloseButton>

          <CollapseButton
            type="button"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed((state) => !state)}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </CollapseButton>
        </SidebarTop>

        <NavArea aria-label="Menu principal">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <NavItem
                key={item.href}
                href={item.href}
                $active={active}
                $collapsed={collapsed}
                onClick={closeMobileMenu}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} strokeWidth={2.3} />
                {!collapsed && <span>{item.label}</span>}
              </NavItem>
            );
          })}
        </NavArea>

        <SidebarBottom $collapsed={collapsed}>
          <LogoutButton
            type="button"
            $collapsed={collapsed}
            onClick={handleLogout}
            disabled={isSigningOut}
            title={collapsed ? "Sair" : undefined}
          >
            <LogOut size={18} strokeWidth={2.4} />
            {!collapsed && <span>{isSigningOut ? "Saindo..." : "Sair"}</span>}
          </LogoutButton>
        </SidebarBottom>
      </Sidebar>

      <MainArea $collapsed={collapsed}>
        <Header>
          <HeaderLeft>
            <MobileMenuButton
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </MobileMenuButton>

            <TitleGroup>
              <span>Sistema de Gestão</span>
              <h1>{pageTitle}</h1>
            </TitleGroup>
          </HeaderLeft>

          <HeaderActions>
            <IconButton type="button" aria-label="Configurações">
              <Settings size={18} />
            </IconButton>

            <IconButton type="button" aria-label="Notificações">
              <Bell size={18} />
              <Dot />
            </IconButton>

            <UserBox>
              <Avatar>{getInitials(access.name)}</Avatar>
              <UserInfo>
                <strong>{access.name}</strong>
                <span>
                  {access.hotelName} · {roleLabels[access.role]}
                </span>
              </UserInfo>
            </UserBox>
          </HeaderActions>
        </Header>

        <Content>{children}</Content>
      </MainArea>
    </Shell>
  );
}

const Shell = styled.div`
  min-height: 100vh;
  background:
    radial-gradient(
      circle at top left,
      rgba(36, 107, 254, 0.1),
      transparent 34%
    ),
    ${({ theme }) => theme.colors.background};
`;

const MobileOverlay = styled.button<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 18;
  display: none;
  border: 0;
  background: rgba(15, 23, 42, 0.38);
  opacity: ${({ $open }) => ($open ? 1 : 0)};
  pointer-events: ${({ $open }) => ($open ? "auto" : "none")};
  transition: 180ms ease;

  @media (max-width: 960px) {
    display: block;
  }
`;

const Sidebar = styled.aside<{ $collapsed: boolean; $mobileOpen: boolean }>`
  position: fixed;
  inset: 24px auto 24px 24px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  width: ${({ theme, $collapsed }) =>
    $collapsed ? theme.layout.sidebarCollapsed : theme.layout.sidebarExpanded};
  padding: 22px 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background:
    radial-gradient(
      circle at 110% 0%,
      rgba(255, 255, 255, 0.17),
      transparent 34%
    ),
    linear-gradient(160deg, #434ce4, #434ce4 55%, #434ce4);
  color: #fff;
  box-shadow: ${({ theme }) => theme.shadow.sidebar};
  transition:
    width 220ms ease,
    transform 220ms ease;

  @media (max-width: 960px) {
    width: min(286px, calc(100vw - 36px));
    transform: translateX(
      ${({ $mobileOpen }) => ($mobileOpen ? "0" : "calc(-100% - 34px)")}
    );
  }

  @media (max-width: 520px) {
    inset: 16px auto 16px 16px;
    width: min(286px, calc(100vw - 32px));
  }
`;

const SidebarTop = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 44px;
  margin-bottom: 28px;
`;

const Brand = styled(Link)<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) =>
    $collapsed ? "center" : "flex-start"};
  width: 100%;
  min-width: 0;
  gap: 12px;
`;

const BrandMark = styled.div`
  flex: 0 0 auto;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.18);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 13px;
  font-weight: 950;
  letter-spacing: -0.08em;
`;

const BrandText = styled.div`
  display: grid;
  gap: 1px;
  min-width: 0;

  strong {
    font-size: 15px;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1.1;
  }

  span {
    font-size: 12px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.72);
  }
`;

const CollapseButton = styled.button`
  position: absolute;
  top: 50%;
  right: -30px;
  transform: translateY(-50%);
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.primary};
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.11);
  transition: 180ms ease;

  &:hover {
    transform: translateY(-50%) scale(1.04);
    color: ${({ theme }) => theme.colors.primaryDark};
  }

  @media (max-width: 960px) {
    display: none;
  }
`;

const MobileCloseButton = styled.button`
  display: none;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.14);
  color: #fff;

  @media (max-width: 960px) {
    display: grid;
    margin-left: auto;
  }
`;

const NavArea = styled.nav`
  display: grid;
  gap: 8px;
`;

const NavItem = styled(Link)<{ $active: boolean; $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) =>
    $collapsed ? "center" : "flex-start"};
  gap: 13px;
  height: 48px;
  padding: ${({ $collapsed }) => ($collapsed ? "0" : "0 16px")};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: 13px;
  font-weight: 850;
  color: rgba(255, 255, 255, 0.74);
  transition: 180ms ease;

  ${({ $active }) =>
    $active &&
    css`
      background: #fff;
      color: #246bfe;
      box-shadow: 0 14px 30px rgba(15, 23, 42, 0.1);
    `}

  &:hover {
    background: ${({ $active }) =>
      $active ? "#fff" : "rgba(255, 255, 255, 0.14)"};
    color: ${({ $active }) => ($active ? "#246bfe" : "#fff")};
  }
`;

const SidebarBottom = styled.div<{ $collapsed: boolean }>`
  display: grid;
  gap: 14px;
  margin-top: auto;
  justify-items: ${({ $collapsed }) => ($collapsed ? "center" : "stretch")};
`;

const LogoutButton = styled.button<{ $collapsed: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) =>
    $collapsed ? "center" : "flex-start"};
  gap: 12px;
  width: 100%;
  height: 46px;
  padding: ${({ $collapsed }) => ($collapsed ? "0" : "0 15px")};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.86);
  font-size: 13px;
  font-weight: 850;
  transition: 180ms ease;

  &:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }

  &:disabled {
    cursor: wait;
    opacity: 0.72;
  }
`;

const MainArea = styled.main<{ $collapsed: boolean }>`
  min-height: 100vh;
  padding: 24px 26px 26px;
  padding-left: ${({ theme, $collapsed }) =>
    $collapsed
      ? `calc(${theme.layout.sidebarCollapsed} + ${theme.layout.sidebarGap} + 30px)`
      : `calc(${theme.layout.sidebarExpanded} + ${theme.layout.sidebarGap} + 26px)`};
  transition: padding-left 220ms ease;

  @media (max-width: 960px) {
    padding: 18px;
  }

  @media (max-width: 520px) {
    padding: 14px;
  }
`;

const Header = styled.header`
  display: grid;
  grid-template-columns: minmax(190px, 1fr) minmax(260px, 520px) auto;
  align-items: center;
  gap: 18px;
  min-height: ${({ theme }) => theme.layout.headerHeight};
  max-width: ${({ theme }) => theme.layout.contentMaxWidth};
  margin: 0 auto;
  padding: 0 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.88);
  box-shadow: ${({ theme }) => theme.shadow.card};
  backdrop-filter: blur(14px);

  @media (max-width: 1160px) {
    grid-template-columns: 1fr auto;

    > label {
      display: none;
    }
  }

  @media (max-width: 520px) {
    min-height: 74px;
    padding: 0 12px;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
`;

const MobileMenuButton = styled.button`
  display: none;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surfaceSoft};
  color: ${({ theme }) => theme.colors.text};

  @media (max-width: 960px) {
    display: grid;
  }
`;

const TitleGroup = styled.div`
  display: grid;
  gap: 3px;
  min-width: 0;

  span {
    font-size: 12px;
    font-weight: 850;
    color: ${({ theme }) => theme.colors.muted};
  }

  h1 {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: clamp(19px, 2vw, 25px);
    letter-spacing: -0.055em;
  }

  @media (max-width: 520px) {
    span {
      display: none;
    }

    h1 {
      font-size: 20px;
    }
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
`;

const IconButton = styled.button`
  position: relative;
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSoft};
  transition: 180ms ease;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    border-color: rgba(36, 107, 254, 0.22);
    background: ${({ theme }) => theme.colors.primarySoft};
  }

  @media (max-width: 520px) {
    width: 40px;
    height: 40px;
  }
`;

const Dot = styled.span`
  position: absolute;
  top: 10px;
  right: 11px;
  width: 8px;
  height: 8px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.danger};
`;

const UserBox = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 760px) {
    display: none;
  }
`;

const Avatar = styled.div`
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: linear-gradient(135deg, #246bfe, #6c5ffc);
  color: #fff;
  font-size: 13px;
  font-weight: 900;
`;

const UserInfo = styled.div`
  display: grid;
  gap: 2px;

  strong {
    font-size: 13px;
  }

  span {
    font-size: 12px;
    font-weight: 750;
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const Content = styled.div`
  width: 100%;
  max-width: ${({ theme }) => theme.layout.contentMaxWidth};
  margin: 0 auto;
  padding: 24px 0 0;

  @media (max-width: 960px) {
    padding-top: 18px;
  }

  @media (max-width: 520px) {
    padding-top: 14px;
  }
`;
