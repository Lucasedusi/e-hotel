"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styled from "styled-components";
import { Building2, LogOut, ShieldAlert } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface AccessStatusProps {
  kind: "onboarding" | "denied";
  title: string;
  description: string;
  showDashboardLink?: boolean;
}

export function AccessStatus({
  kind,
  title,
  description,
  showDashboardLink = false,
}: AccessStatusProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const Icon = kind === "onboarding" ? Building2 : ShieldAlert;

  async function handleLogout() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    document.cookie =
      "e_hotel_selected_hotel=; Path=/; Max-Age=0; SameSite=Lax";
    router.replace("/login");
    router.refresh();
  }

  return (
    <Page>
      <Card>
        <IconBox $kind={kind}>
          <Icon size={26} />
        </IconBox>
        <span>
          {kind === "onboarding" ? "Configuração inicial" : "Acesso protegido"}
        </span>
        <h1>{title}</h1>
        <p>{description}</p>
        <Actions>
          {showDashboardLink && (
            <Link href="/dashboard">Voltar ao dashboard</Link>
          )}
          <button type="button" onClick={handleLogout} disabled={isSigningOut}>
            <LogOut size={17} />
            {isSigningOut ? "Saindo..." : "Sair da conta"}
          </button>
        </Actions>
      </Card>
    </Page>
  );
}

const Page = styled.main`
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(
      circle at 18% 20%,
      rgba(36, 107, 254, 0.18),
      transparent 28%
    ),
    ${({ theme }) => theme.colors.background};
`;

const Card = styled.section`
  width: min(100%, 520px);
  padding: 34px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};

  > span {
    display: block;
    margin-top: 18px;
    color: ${({ theme }) => theme.colors.primary};
    font-size: 12px;
    font-weight: 850;
  }

  h1 {
    margin: 9px 0 10px;
    font-size: clamp(28px, 5vw, 38px);
    letter-spacing: -0.06em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 14px;
    line-height: 1.7;
  }
`;

const IconBox = styled.div<{ $kind: AccessStatusProps["kind"] }>`
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme, $kind }) =>
    $kind === "onboarding"
      ? theme.colors.primarySoft
      : theme.colors.dangerSoft};
  color: ${({ theme, $kind }) =>
    $kind === "onboarding" ? theme.colors.primary : theme.colors.danger};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;

  a,
  button {
    display: inline-flex;
    min-height: 46px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 17px;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.md};
    font-size: 13px;
    font-weight: 800;
  }

  a {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }

  button {
    background: ${({ theme }) => theme.colors.surfaceSoft};
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;
