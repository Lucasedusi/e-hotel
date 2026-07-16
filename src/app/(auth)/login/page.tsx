"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styled, { keyframes } from "styled-components";
import {
  BedDouble,
  CalendarCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const SELECTED_HOTEL_COOKIE = "e_hotel_selected_hotel";

const authErrorMessages: Record<string, string> = {
  invalid_credentials:
    "E-mail ou senha incorretos. Confira os dados e tente novamente.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar no sistema.",
  user_banned: "Este usuário está bloqueado. Procure um administrador.",
  over_request_rate_limit:
    "Muitas tentativas de acesso. Aguarde alguns minutos.",
  validation_failed: "Preencha um e-mail e uma senha válidos.",
};

function getAuthErrorMessage(code?: string) {
  if (code && authErrorMessages[code]) return authErrorMessages[code];
  return "Não foi possível realizar o login. Tente novamente em instantes.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setErrorMessage("Informe seu e-mail e sua senha para continuar.");
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error || !data.user) {
        setErrorMessage(getAuthErrorMessage(error?.code));
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError || !profile) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Seu perfil de acesso não foi encontrado. Procure um administrador.",
        );
        return;
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Seu usuário está inativo. Procure um administrador do sistema.",
        );
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("hotel_members")
        .select("hotel_id, hotels!inner(status)")
        .eq("user_id", data.user.id)
        .eq("is_active", true)
        .eq("hotels.status", "active")
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Não foi possível verificar seu acesso ao hotel. Tente novamente.",
        );
        return;
      }

      if (!membership) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }

      document.cookie = `${SELECTED_HOTEL_COOKIE}=${membership.hotel_id}; Path=/; Max-Age=2592000; SameSite=Lax`;
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErrorMessage(
        "Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Page>
      <LoginPanel>
        <LoginContent>
          <Brand aria-label="E-Hotel">
            <BrandIcon>
              <BedDouble size={23} strokeWidth={2.4} />
            </BrandIcon>
            <BrandName>
              <strong>E-Hotel</strong>
              <span>Gestão hoteleira</span>
            </BrandName>
          </Brand>

          <Heading>
            <span>Bem-vindo de volta!</span>
            <h1>Acesse sua conta</h1>
            <p>Informe seus dados para entrar no sistema.</p>
          </Heading>

          <Form onSubmit={handleSubmit} noValidate>
            <Field>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="seuemail@hotel.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                aria-invalid={Boolean(errorMessage)}
              />
            </Field>

            <Field>
              <Label htmlFor="password">Senha</Label>
              <PasswordBox>
                <PasswordInput
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errorMessage)}
                />
                <PasswordToggle
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                  disabled={isSubmitting}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </PasswordToggle>
              </PasswordBox>
            </Field>

            {errorMessage && (
              <ErrorAlert role="alert" aria-live="polite">
                {errorMessage}
              </ErrorAlert>
            )}

            <SubmitButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <LoaderCircle size={18} />
                  Entrando...
                </>
              ) : (
                "Entrar no sistema"
              )}
            </SubmitButton>
          </Form>

          <SecurityNote>
            <ShieldCheck size={16} />
            Seus dados são protegidos por uma conexão segura.
          </SecurityNote>
        </LoginContent>
      </LoginPanel>

      <VisualPanel aria-hidden="true">
        <VisualContent>
          <VisualBadge>
            <CheckCircle2 size={17} />
            Gestão simples e organizada
          </VisualBadge>
          <h2>Tudo o que seu hotel precisa, em um único lugar.</h2>

          <PreviewCard>
            <PreviewHeader>
              <div>
                <span>Visão geral</span>
                <strong>Ocupação do hotel</strong>
              </div>
              <PreviewPill>Hoje</PreviewPill>
            </PreviewHeader>
            <PreviewStats>
              <PreviewStat>
                <CalendarCheck size={18} />
                <div>
                  <strong>18</strong>
                  <span>Reservas</span>
                </div>
              </PreviewStat>
              <PreviewStat>
                <UsersRound size={18} />
                <div>
                  <strong>34</strong>
                  <span>Hóspedes</span>
                </div>
              </PreviewStat>
              <PreviewStat>
                <WalletCards size={18} />
                <div>
                  <strong>75%</strong>
                  <span>Ocupação</span>
                </div>
              </PreviewStat>
            </PreviewStats>
            <Bars>
              {[46, 68, 57, 82, 61, 76, 91, 73, 87].map((height, index) => (
                <Bar key={`${height}-${index}`} $height={height} />
              ))}
            </Bars>
          </PreviewCard>
        </VisualContent>
      </VisualPanel>
    </Page>
  );
}

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Page = styled.main`
  display: grid;
  grid-template-columns: minmax(600px, 0.84fr) minmax(400px, 1.16fr);
  min-height: 100dvh;
  padding: 20px;
  background: ${({ theme }) => theme.colors.background};

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
    padding: 0;
  }
`;

const LoginPanel = styled.section`
  display: grid;
  place-items: center;
  padding: 42px;

  @media (max-width: 520px) {
    padding: 28px 20px;
  }
`;

const LoginContent = styled.div`
  width: min(100%, 440px);
  background: #fff;
  padding: 32px 42px;
  border-radius: ${({ theme }) => theme.radius.md};
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const BrandIcon = styled.div`
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  box-shadow: 0 12px 28px rgba(36, 107, 254, 0.24);
`;

const BrandName = styled.div`
  display: grid;
  gap: 1px;

  strong {
    font-size: 18px;
    letter-spacing: -0.04em;
  }

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 11px;
    font-weight: 750;
  }
`;

const Heading = styled.header`
  margin: 42px 0 28px;

  > span {
    color: ${({ theme }) => theme.colors.primary};
    font-size: 13px;
    font-weight: 850;
  }

  h1 {
    margin: 9px 0 8px;
    font-size: clamp(30px, 4vw, 40px);
    line-height: 1.08;
    letter-spacing: -0.06em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 14px;
    line-height: 1.6;
  }

  @media (max-width: 520px) {
    margin-top: 48px;
  }
`;

const Form = styled.form`
  display: grid;
  gap: 18px;
`;

const Field = styled.div`
  display: grid;
  gap: 8px;
`;

const Label = styled.label`
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  font-weight: 800;
`;

const inputStyles = `
  width: 100%;
  height: 54px;
  border: 1px solid #DDE6F2;
  border-radius: 12px;
  outline: 0;
  background: #F8FAFE;
  color: #111827;
  font-size: 14px;
  font-weight: 600;
  transition: 180ms ease;

  &::placeholder { color: #A0A8B6; font-weight: 500; }
  &:hover { border-color: #C9D7E8; }
  &:focus {
    border-color: rgba(36, 107, 254, 0.72);
    background: #fff;
    box-shadow: 0 0 0 4px rgba(36, 107, 254, 0.09);
  }
  &:disabled { cursor: not-allowed; opacity: 0.7; }
`;

const Input = styled.input`
  ${inputStyles}
  padding: 0 16px;
`;

const PasswordBox = styled.div`
  position: relative;
`;

const PasswordInput = styled.input`
  ${inputStyles}
  padding: 0 52px 0 16px;
`;

const PasswordToggle = styled.button`
  position: absolute;
  top: 50%;
  right: 8px;
  display: grid;
  width: 38px;
  height: 38px;
  transform: translateY(-50%);
  place-items: center;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.colors.primarySoft};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const ErrorAlert = styled.div`
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.dangerSoft};
  color: #b42318;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
`;

const SubmitButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  height: 54px;
  margin-top: 2px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 14px;
  font-weight: 850;
  box-shadow: 0 14px 32px rgba(36, 107, 254, 0.23);
  transition: 180ms ease;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary};
    opacity: 0.94;
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.76;
  }

  svg {
    animation: ${spin} 0.8s linear infinite;
  }
`;

const SecurityNote = styled.p`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 24px 0 0;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 11px;
  font-weight: 650;

  svg {
    color: ${({ theme }) => theme.colors.success};
  }
`;

const VisualPanel = styled.aside`
  position: relative;
  display: grid;
  min-height: calc(100dvh - 40px);
  place-items: center;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.md};
  background:
    radial-gradient(
      circle at 105% 0%,
      rgba(255, 255, 255, 0.19),
      transparent 32%
    ),
    radial-gradient(
      circle at 0% 100%,
      rgba(11, 45, 102, 0.34),
      transparent 38%
    ),
    linear-gradient(145deg, #434ce4 0%, #434ce4 50%, #434ce4 100%);
  color: #fff;

  &::before,
  &::after {
    content: "";
    position: absolute;
    width: 360px;
    height: 360px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 50%;
  }

  &::before {
    top: -210px;
    left: -90px;
  }
  &::after {
    right: -220px;
    bottom: -160px;
  }

  @media (max-width: 980px) {
    display: none;
  }
`;

const VisualContent = styled.div`
  position: relative;
  z-index: 1;
  width: min(82%, 760px);

  > h2 {
    max-width: 690px;
    margin: 20px 0 16px;
    font-size: clamp(38px, 5.1vw, 56px);
    line-height: 1.04;
    letter-spacing: -0.065em;

    u {
      text-decoration-thickness: 3px;
      text-underline-offset: 8px;
    }
  }

  > p {
    max-width: 610px;
    margin: 0;
    color: rgba(255, 255, 255, 0.74);
    font-size: 15px;
    line-height: 1.7;
  }
`;

const VisualBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.13);
  color: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  font-weight: 800;
`;

const PreviewCard = styled.div`
  margin-top: 22px;
  padding: 24px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.96);
  color: ${({ theme }) => theme.colors.text};
  box-shadow: 0 30px 70px rgba(11, 45, 102, 0.3);
`;

const PreviewHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;

  > div {
    display: grid;
    gap: 4px;
  }

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 11px;
    font-weight: 750;
  }
  strong {
    font-size: 15px;
  }
`;

const PreviewPill = styled.span`
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary} !important;
`;

const PreviewStats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 22px;
`;

const PreviewStat = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surfaceSoft};
  color: ${({ theme }) => theme.colors.primary};

  > div {
    display: grid;
    gap: 2px;
  }
  strong {
    color: ${({ theme }) => theme.colors.text};
    font-size: 15px;
  }
  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 10px;
  }
`;

const Bars = styled.div`
  display: flex;
  align-items: end;
  gap: 12px;
  height: 138px;
  margin-top: 22px;
  padding: 18px 16px 0;
  border-radius: ${({ theme }) => theme.radius.md};
  background: linear-gradient(to bottom, #f8fafe, #fff);
`;

const Bar = styled.span<{ $height: number }>`
  flex: 1;
  height: ${({ $height }) => `${$height}%`};
  min-width: 8px;
  border-radius: 7px 7px 2px 2px;
  background: linear-gradient(180deg, #6c9aff, #246bfe);
`;
