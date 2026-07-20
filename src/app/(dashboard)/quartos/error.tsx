"use client";

import { useEffect } from "react";
import styled from "styled-components";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function RoomsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorCard role="alert">
      <IconBox><AlertTriangle size={22} /></IconBox>
      <div>
        <h2>Não foi possível carregar os quartos</h2>
        <p>Confira sua conexão e tente novamente. Se o problema continuar, confirme se as tabelas do módulo foram criadas no Supabase.</p>
      </div>
      <button type="button" onClick={reset}><RefreshCw size={17} /> Tentar novamente</button>
    </ErrorCard>
  );
}

const ErrorCard = styled.section`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 24px;
  border: 1px solid ${({ theme }) => theme.colors.dangerSoft};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};

  h2 { margin: 0 0 5px; font-size: 18px; }
  p { margin: 0; color: ${({ theme }) => theme.colors.textSoft}; font-size: 14px; line-height: 1.6; }
  button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border: 0; border-radius: 12px; background: ${({ theme }) => theme.colors.primary}; color: white; font-weight: 800; }
  @media (max-width: 700px) { grid-template-columns: auto 1fr; button { grid-column: 1 / -1; justify-content: center; } }
`;

const IconBox = styled.div`
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.dangerSoft};
  color: ${({ theme }) => theme.colors.danger};
`;
