"use client";

import styled from "styled-components";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ReservationsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <State>
      <span><AlertTriangle size={24} /></span>
      <h2>Não foi possível carregar as reservas</h2>
      <p>Confira sua conexão e tente novamente. Se o problema continuar, confirme se as estruturas do módulo foram criadas no Supabase.</p>
      <button type="button" onClick={reset}><RefreshCw size={16} /> Tentar novamente</button>
    </State>
  );
}

const State = styled.main`
  display: grid; min-height: 420px; place-content: center; justify-items: center; padding: 32px; text-align: center;
  > span { display: grid; width: 54px; height: 54px; place-items: center; border-radius: 12px; background: ${({ theme }) => theme.colors.dangerSoft}; color: ${({ theme }) => theme.colors.danger}; }
  h2 { margin: 18px 0 7px; font-size: 20px; }
  p { max-width: 520px; margin: 0 0 20px; color: ${({ theme }) => theme.colors.textSoft}; font-size: 13px; line-height: 1.65; }
  button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 17px; border: 0; border-radius: 12px; background: ${({ theme }) => theme.colors.primary}; color: white; font-weight: 800; }
`;
