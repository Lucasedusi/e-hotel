"use client";

import styled from "styled-components";

interface ModulePlaceholderProps {
  title: string;
  description: string;
  badge: string;
}

export function ModulePlaceholder({
  title,
  description,
  badge,
}: ModulePlaceholderProps) {
  return (
    <Wrapper>
      <span>{badge}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <CardGrid>
        <MiniCard>
          <strong>Próxima etapa</strong>
          <p>
            Este módulo será implementado com banco de dados, formulários,
            filtros e ações reais.
          </p>
        </MiniCard>
        <MiniCard>
          <strong>Padrão visual</strong>
          <p>
            Os cards, títulos, espaços e botões já seguem a base definida para o
            sistema.
          </p>
        </MiniCard>
      </CardGrid>
    </Wrapper>
  );
}

const Wrapper = styled.section`
  padding: 34px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};

  > span {
    display: inline-flex;
    padding: 8px 12px;
    border-radius: 999px;
    background: ${({ theme }) => theme.colors.primarySoft};
    color: ${({ theme }) => theme.colors.primary};
    font-size: 12px;
    font-weight: 900;
  }

  h2 {
    margin: 18px 0 10px;
    font-size: clamp(28px, 4vw, 42px);
    letter-spacing: -0.07em;
  }

  > p {
    max-width: 740px;
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 15px;
    line-height: 1.7;
  }
`;

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 26px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const MiniCard = styled.article`
  padding: 20px;
  border-radius: 22px;
  background: ${({ theme }) => theme.colors.surfaceSoft};

  strong {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 13px;
    line-height: 1.65;
  }
`;
