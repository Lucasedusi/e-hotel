"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styled, { css, keyframes } from "styled-components";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Hotel,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

interface OnboardingFormProps {
  userName: string;
  userEmail: string;
}

interface FormValues {
  organizationName: string;
  hotelName: string;
  document: string;
  phone: string;
  email: string;
}

type FormErrors = Partial<Record<keyof FormValues, string>>;
type Step = 1 | 2 | 3;

interface BootstrapResult {
  organization_id: string;
  hotel_id: string;
}

interface ExistingMembership {
  hotelId: string;
  isActive: boolean;
  hotelStatus?: string;
}

const SELECTED_HOTEL_COOKIE = "e_hotel_selected_hotel";

const steps = [
  {
    number: 1 as const,
    title: "Organização",
    description: "Dados da empresa",
    icon: Building2,
  },
  {
    number: 2 as const,
    title: "Hotel",
    description: "Dados da unidade",
    icon: Hotel,
  },
  {
    number: 3 as const,
    title: "Revisão",
    description: "Confirmar cadastro",
    icon: CheckCircle2,
  },
];

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatDocument(value: string) {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function nullableValue(value: string) {
  const normalized = value.trim();
  return normalized || null;
}

function getBootstrapErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("perfil") && normalized.includes("inativ")) {
    return "Seu perfil está inativo. Procure um administrador do sistema.";
  }

  if (normalized.includes("ja possui") || normalized.includes("já possui")) {
    return "Sua organização já foi configurada. Estamos atualizando seu acesso.";
  }

  if (normalized.includes("nome") && normalized.includes("obrigat")) {
    return "Preencha o nome da organização e o nome do hotel.";
  }

  return "Não foi possível concluir a configuração. Revise os dados e tente novamente.";
}

export function OnboardingForm({ userName, userEmail }: OnboardingFormProps) {
  const router = useRouter();
  const submissionStarted = useRef(false);
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<FormValues>({
    organizationName: "",
    hotelName: "",
    document: "",
    phone: "",
    email: userEmail,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  function updateValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setGeneralError("");
  }

  function validateStep(currentStep: Step) {
    const nextErrors: FormErrors = {};

    if (currentStep === 1 && values.organizationName.trim().length < 2) {
      nextErrors.organizationName = "Informe o nome da organização.";
    }

    if (currentStep === 2) {
      if (values.hotelName.trim().length < 2) {
        nextErrors.hotelName = "Informe o nome do hotel ou pousada.";
      }

      const documentDigits = onlyDigits(values.document);
      if (
        documentDigits &&
        documentDigits.length !== 11 &&
        documentDigits.length !== 14
      ) {
        nextErrors.document = "Informe um CPF ou CNPJ completo.";
      }

      const phoneDigits = onlyDigits(values.phone);
      if (phoneDigits && phoneDigits.length < 10) {
        nextErrors.phone = "Informe um telefone com DDD.";
      }

      if (
        values.email.trim() &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
      ) {
        nextErrors.email = "Informe um e-mail válido.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function goToNextStep() {
    if (!validateStep(step)) return;
    setStep((current) => Math.min(current + 1, 3) as Step);
  }

  function goToPreviousStep() {
    setGeneralError("");
    setStep((current) => Math.max(current - 1, 1) as Step);
  }

  function saveSelectedHotel(hotelId: string) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SELECTED_HOTEL_COOKIE}=${hotelId}; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
  }

  async function findExistingMembership(
    supabase: ReturnType<typeof createSupabaseBrowserClient>,
    userId: string,
  ) {
    const { data } = await supabase
      .from("hotel_members")
      .select("hotel_id, is_active, hotels(status)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!data) return null;

    const hotels = data.hotels as
      | { status?: string }
      | { status?: string }[]
      | null;
    const hotel = Array.isArray(hotels) ? hotels[0] : hotels;

    return {
      hotelId: data.hotel_id as string,
      isActive: Boolean(data.is_active),
      hotelStatus: hotel?.status,
    } satisfies ExistingMembership;
  }

  function finishOnboarding(hotelId: string) {
    saveSelectedHotel(hotelId);
    setIsComplete(true);

    window.setTimeout(() => {
      router.replace("/dashboard");
      router.refresh();
    }, 900);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step < 3) {
      goToNextStep();
      return;
    }

    if (isSubmitting || submissionStarted.current) return;
    submissionStarted.current = true;
    setIsSubmitting(true);
    setGeneralError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        router.refresh();
        return;
      }

      const existingMembership = await findExistingMembership(
        supabase,
        user.id,
      );
      if (existingMembership) {
        if (
          existingMembership.isActive &&
          existingMembership.hotelStatus === "active"
        ) {
          finishOnboarding(existingMembership.hotelId);
          return;
        }

        setGeneralError(
          "Seu usuário já possui um vínculo, mas ele ou o hotel está inativo. Procure um administrador.",
        );
        submissionStarted.current = false;
        return;
      }

      const { data, error } = await supabase.rpc("bootstrap_organization", {
        p_organization_name: values.organizationName.trim(),
        p_hotel_name: values.hotelName.trim(),
        p_hotel_document: nullableValue(values.document),
        p_hotel_phone: nullableValue(values.phone),
        p_hotel_email: nullableValue(values.email.toLowerCase()),
      });

      if (error) {
        const membershipCreatedInParallel = await findExistingMembership(
          supabase,
          user.id,
        );

        if (
          membershipCreatedInParallel?.isActive &&
          membershipCreatedInParallel.hotelStatus === "active"
        ) {
          finishOnboarding(membershipCreatedInParallel.hotelId);
          return;
        }

        setGeneralError(getBootstrapErrorMessage(error.message));
        submissionStarted.current = false;
        return;
      }

      const result = (
        Array.isArray(data) ? data[0] : data
      ) as BootstrapResult | null;

      if (!result?.hotel_id) {
        const createdMembership = await findExistingMembership(
          supabase,
          user.id,
        );

        if (
          !createdMembership?.isActive ||
          createdMembership.hotelStatus !== "active"
        ) {
          setGeneralError(
            "A configuração foi processada, mas o hotel não pôde ser carregado. Atualize a página e tente novamente.",
          );
          submissionStarted.current = false;
          return;
        }

        finishOnboarding(createdMembership.hotelId);
        return;
      }

      finishOnboarding(result.hotel_id);
    } catch {
      setGeneralError(
        "Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.",
      );
      submissionStarted.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    if (isSigningOut || isSubmitting) return;
    setIsSigningOut(true);

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    document.cookie = `${SELECTED_HOTEL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    router.replace("/login");
    router.refresh();
  }

  return (
    <Page>
      <TopBar>
        <Brand>
          <BrandIcon>
            <Hotel size={21} />
          </BrandIcon>
          <div>
            <strong>E-Hotel</strong>
            <span>Configuração inicial</span>
          </div>
        </Brand>

        <UserArea>
          <UserIdentity>
            <strong>{userName}</strong>
            <span>{userEmail}</span>
          </UserIdentity>
          <LogoutButton
            type="button"
            onClick={handleLogout}
            disabled={isSigningOut || isSubmitting}
          >
            <LogOut size={17} />
            <span>{isSigningOut ? "Saindo..." : "Sair"}</span>
          </LogoutButton>
        </UserArea>
      </TopBar>

      <Shell>
        <Aside>
          <AsideBadge>
            <ShieldCheck size={16} />
            Ambiente seguro
          </AsideBadge>
          <h1>Vamos preparar seu hotel</h1>
          <p>
            São apenas três passos rápidos para deixar a estrutura inicial do
            sistema pronta.
          </p>

          <StepList aria-label="Etapas da configuração">
            {steps.map((item) => {
              const Icon = item.icon;
              const isActive = step === item.number;
              const isDone = step > item.number || isComplete;

              return (
                <StepItem
                  key={item.number}
                  $active={isActive}
                  $done={isDone}
                  aria-current={isActive ? "step" : undefined}
                >
                  <StepIcon $active={isActive} $done={isDone}>
                    {isDone ? <Check size={17} /> : <Icon size={17} />}
                  </StepIcon>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </div>
                </StepItem>
              );
            })}
          </StepList>

          <AutomaticItems>
            <span>Também criaremos automaticamente:</span>
            <div>
              <CircleDollarSign size={16} />
              Contas e categorias financeiras
            </div>
            <div>
              <CreditCard size={16} />
              Formas de pagamento padrão
            </div>
          </AutomaticItems>
        </Aside>

        <FormCard>
          {isComplete ? (
            <SuccessContent role="status" aria-live="polite">
              <SuccessIcon>
                <Check size={32} />
              </SuccessIcon>
              <span>Configuração concluída</span>
              <h2>Seu hotel está pronto!</h2>
              <p>
                A organização, o hotel e os cadastros iniciais foram criados.
                Estamos abrindo seu dashboard.
              </p>
              <LoadingLine>
                <span />
              </LoadingLine>
            </SuccessContent>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <FormHeader>
                <ProgressInfo>
                  <span>Etapa {step} de 3</span>
                  <strong>{Math.round((step / 3) * 100)}% concluído</strong>
                </ProgressInfo>
                <ProgressBar>
                  <span style={{ width: `${(step / 3) * 100}%` }} />
                </ProgressBar>
              </FormHeader>

              <FormBody>
                {step === 1 && (
                  <StepContent>
                    <SectionIcon>
                      <Building2 size={23} />
                    </SectionIcon>
                    <SectionHeading>
                      <span>Primeiro passo</span>
                      <h2>Dados da organização</h2>
                      <p>
                        A organização representa a empresa ou responsável que
                        administra um ou mais hotéis no E-Hotel.
                      </p>
                    </SectionHeading>

                    <Field>
                      <Label htmlFor="organizationName">
                        Nome da organização <Required>*</Required>
                      </Label>
                      <Input
                        id="organizationName"
                        name="organizationName"
                        type="text"
                        autoComplete="organization"
                        placeholder="Ex.: Grupo Hotel Norte"
                        value={values.organizationName}
                        onChange={(event) =>
                          updateValue("organizationName", event.target.value)
                        }
                        aria-invalid={Boolean(errors.organizationName)}
                        aria-describedby={
                          errors.organizationName
                            ? "organizationName-error"
                            : "organizationName-help"
                        }
                        autoFocus
                      />
                      {errors.organizationName ? (
                        <FieldError id="organizationName-error">
                          {errors.organizationName}
                        </FieldError>
                      ) : (
                        <FieldHelp id="organizationName-help">
                          Pode ser o nome da empresa, grupo ou proprietário.
                        </FieldHelp>
                      )}
                    </Field>

                    <InfoCard>
                      <LockKeyhole size={19} />
                      <div>
                        <strong>Você será o proprietário</strong>
                        <span>
                          Seu usuário receberá automaticamente o perfil owner do
                          primeiro hotel.
                        </span>
                      </div>
                    </InfoCard>
                  </StepContent>
                )}

                {step === 2 && (
                  <StepContent>
                    <SectionIcon>
                      <Hotel size={23} />
                    </SectionIcon>
                    <SectionHeading>
                      <span>Segundo passo</span>
                      <h2>Dados do primeiro hotel</h2>
                      <p>
                        Informe os dados principais da unidade. Apenas o nome é
                        obrigatório; os demais podem ser preenchidos depois.
                      </p>
                    </SectionHeading>

                    <Field>
                      <Label htmlFor="hotelName">
                        Nome do hotel ou pousada <Required>*</Required>
                      </Label>
                      <Input
                        id="hotelName"
                        name="hotelName"
                        type="text"
                        autoComplete="organization"
                        placeholder="Ex.: Pousada Bela Vista"
                        value={values.hotelName}
                        onChange={(event) =>
                          updateValue("hotelName", event.target.value)
                        }
                        aria-invalid={Boolean(errors.hotelName)}
                        autoFocus
                      />
                      {errors.hotelName && (
                        <FieldError>{errors.hotelName}</FieldError>
                      )}
                    </Field>

                    <FieldGrid>
                      <Field>
                        <Label htmlFor="document">CPF ou CNPJ</Label>
                        <Input
                          id="document"
                          name="document"
                          type="text"
                          inputMode="numeric"
                          placeholder="00.000.000/0000-00"
                          value={values.document}
                          onChange={(event) =>
                            updateValue(
                              "document",
                              formatDocument(event.target.value),
                            )
                          }
                          aria-invalid={Boolean(errors.document)}
                        />
                        {errors.document && (
                          <FieldError>{errors.document}</FieldError>
                        )}
                      </Field>

                      <Field>
                        <Label htmlFor="phone">Telefone</Label>
                        <InputWithIcon>
                          <Phone size={17} />
                          <input
                            id="phone"
                            name="phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="(00) 00000-0000"
                            value={values.phone}
                            onChange={(event) =>
                              updateValue(
                                "phone",
                                formatPhone(event.target.value),
                              )
                            }
                            aria-invalid={Boolean(errors.phone)}
                          />
                        </InputWithIcon>
                        {errors.phone && (
                          <FieldError>{errors.phone}</FieldError>
                        )}
                      </Field>
                    </FieldGrid>

                    <Field>
                      <Label htmlFor="hotelEmail">E-mail do hotel</Label>
                      <InputWithIcon>
                        <Mail size={17} />
                        <input
                          id="hotelEmail"
                          name="hotelEmail"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="contato@hotel.com"
                          value={values.email}
                          onChange={(event) =>
                            updateValue("email", event.target.value)
                          }
                          aria-invalid={Boolean(errors.email)}
                        />
                      </InputWithIcon>
                      {errors.email && <FieldError>{errors.email}</FieldError>}
                    </Field>
                  </StepContent>
                )}

                {step === 3 && (
                  <StepContent>
                    <SectionIcon>
                      <CheckCircle2 size={23} />
                    </SectionIcon>
                    <SectionHeading>
                      <span>Último passo</span>
                      <h2>Revise antes de concluir</h2>
                      <p>
                        Confira os dados. Esta configuração cria a estrutura
                        inicial apenas uma vez para seu usuário.
                      </p>
                    </SectionHeading>

                    <ReviewList>
                      <ReviewItem>
                        <ReviewIcon>
                          <Building2 size={18} />
                        </ReviewIcon>
                        <div>
                          <span>Organização</span>
                          <strong>{values.organizationName}</strong>
                        </div>
                        <EditButton type="button" onClick={() => setStep(1)}>
                          Editar
                        </EditButton>
                      </ReviewItem>

                      <ReviewItem>
                        <ReviewIcon>
                          <Hotel size={18} />
                        </ReviewIcon>
                        <div>
                          <span>Primeiro hotel</span>
                          <strong>{values.hotelName}</strong>
                          <small>
                            {[values.document, values.phone, values.email]
                              .filter(Boolean)
                              .join(" • ") ||
                              "Dados complementares não informados"}
                          </small>
                        </div>
                        <EditButton type="button" onClick={() => setStep(2)}>
                          Editar
                        </EditButton>
                      </ReviewItem>
                    </ReviewList>

                    <CreationSummary>
                      <ShieldCheck size={20} />
                      <div>
                        <strong>
                          Tudo será criado em uma única operação segura
                        </strong>
                        <span>
                          Organização, hotel, acesso de proprietário, contas,
                          categorias e formas de pagamento padrão.
                        </span>
                      </div>
                    </CreationSummary>

                    {generalError && (
                      <GeneralError role="alert" aria-live="polite">
                        {generalError}
                      </GeneralError>
                    )}
                  </StepContent>
                )}
              </FormBody>

              <FormFooter>
                {step > 1 ? (
                  <SecondaryButton
                    type="button"
                    onClick={goToPreviousStep}
                    disabled={isSubmitting}
                  >
                    <ArrowLeft size={17} />
                    Voltar
                  </SecondaryButton>
                ) : (
                  <FooterHint>Campos com * são obrigatórios</FooterHint>
                )}

                {step < 3 ? (
                  <PrimaryButton type="button" onClick={goToNextStep}>
                    Continuar
                    <ArrowRight size={17} />
                  </PrimaryButton>
                ) : (
                  <PrimaryButton type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <LoaderCircle size={18} />
                        Criando estrutura...
                      </>
                    ) : (
                      <>
                        Concluir configuração
                        <Check size={18} />
                      </>
                    )}
                  </PrimaryButton>
                )}
              </FormFooter>
            </form>
          )}
        </FormCard>
      </Shell>
    </Page>
  );
}

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const load = keyframes`
  from { width: 0; }
  to { width: 100%; }
`;

const Page = styled.main`
  min-height: 100dvh;
  padding: 24px;
  background:
    radial-gradient(circle at 8% 8%, rgba(36, 107, 254, 0.13), transparent 24%),
    radial-gradient(
      circle at 92% 92%,
      rgba(108, 95, 252, 0.1),
      transparent 26%
    ),
    ${({ theme }) => theme.colors.background};

  @media (max-width: 680px) {
    padding: 16px;
  }
`;

const TopBar = styled.header`
  display: flex;
  width: min(100%, 1160px);
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin: 0 auto 22px;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 11px;

  > div:last-child {
    display: grid;
    gap: 1px;
  }

  strong {
    font-size: 16px;
    letter-spacing: -0.04em;
  }

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 11px;
    font-weight: 700;
  }
`;

const BrandIcon = styled.div`
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  box-shadow: 0 10px 24px rgba(36, 107, 254, 0.22);
`;

const UserArea = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const UserIdentity = styled.div`
  display: grid;
  gap: 2px;
  text-align: right;

  strong {
    font-size: 12px;
  }

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 10px;
  }

  @media (max-width: 600px) {
    display: none;
  }
`;

const LogoutButton = styled.button`
  display: inline-flex;
  height: 42px;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSoft};
  font-size: 12px;
  font-weight: 800;

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.danger};
    background: ${({ theme }) => theme.colors.dangerSoft};
  }

  &:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  @media (max-width: 420px) {
    span {
      display: none;
    }
  }
`;

const Shell = styled.div`
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  width: min(100%, 1160px);
  min-height: 670px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadow.card};

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Aside = styled.aside`
  position: relative;
  padding: 38px 30px;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 110% 0%,
      rgba(255, 255, 255, 0.17),
      transparent 34%
    ),
    linear-gradient(160deg, #434ce4, #434ce4 55%, #434ce4);
  color: #fff;

  &::after {
    content: "";
    position: absolute;
    right: -120px;
    bottom: -130px;
    width: 290px;
    height: 290px;
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 50%;
  }

  > h1 {
    margin: 22px 0 10px;
    font-size: 31px;
    line-height: 1.08;
    letter-spacing: -0.06em;
  }

  > p {
    margin: 0;
    color: rgba(255, 255, 255, 0.73);
    font-size: 13px;
    line-height: 1.65;
  }

  @media (max-width: 860px) {
    padding: 26px;

    > h1,
    > p,
    > span,
    > div:last-child {
      display: none;
    }
  }
`;

const AsideBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(255, 255, 255, 0.13);
  color: rgba(255, 255, 255, 0.9);
  font-size: 11px;
  font-weight: 800;
`;

const StepList = styled.ol`
  display: grid;
  gap: 11px;
  margin: 34px 0 0;
  padding: 0;
  list-style: none;

  @media (max-width: 860px) {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 0;
  }
`;

const StepItem = styled.li<{ $active: boolean; $done: boolean }>`
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 62px;
  padding: 10px;
  border-radius: ${({ theme }) => theme.radius.md};
  color: rgba(255, 255, 255, 0.65);
  transition: 180ms ease;

  ${({ $active }) =>
    $active &&
    css`
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.13);
    `}

  ${({ $done }) =>
    $done &&
    css`
      color: rgba(255, 255, 255, 0.86);
    `}

  > div:last-child {
    display: grid;
    gap: 2px;
  }

  strong {
    font-size: 12px;
  }

  span {
    font-size: 10px;
    color: inherit;
  }

  @media (max-width: 860px) {
    min-height: 52px;
    justify-content: center;
    padding: 8px;

    > div:last-child {
      display: none;
    }
  }
`;

const StepIcon = styled.div<{ $active: boolean; $done: boolean }>`
  display: grid;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $active, $done }) =>
    $active || $done ? "#fff" : "rgba(255, 255, 255, 0.1)"};
  color: ${({ theme, $active, $done }) =>
    $active || $done ? theme.colors.primary : "rgba(255, 255, 255, 0.72)"};
`;

const AutomaticItems = styled.div`
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
  margin-top: 34px;
  padding: 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: rgba(11, 45, 102, 0.21);

  > span {
    color: rgba(255, 255, 255, 0.65);
    font-size: 10px;
    font-weight: 750;
  }

  > div {
    display: flex;
    align-items: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.88);
    font-size: 10px;
    font-weight: 750;
  }
`;

const FormCard = styled.section`
  display: grid;
  min-width: 0;
  background: ${({ theme }) => theme.colors.surface};

  > form {
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-height: 100%;
  }
`;

const FormHeader = styled.header`
  padding: 26px 38px 0;

  @media (max-width: 600px) {
    padding: 24px 22px 0;
  }
`;

const ProgressInfo = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 9px;

  span,
  strong {
    font-size: 10px;
    font-weight: 800;
  }

  span {
    color: ${({ theme }) => theme.colors.primary};
  }

  strong {
    color: ${({ theme }) => theme.colors.muted};
  }
`;

const ProgressBar = styled.div`
  height: 6px;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primarySoft};

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #246bfe, #6c5ffc);
    transition: width 260ms ease;
  }
`;

const FormBody = styled.div`
  padding: 32px 38px;

  @media (max-width: 600px) {
    padding: 28px 22px;
  }
`;

const StepContent = styled.div`
  display: grid;
  max-width: 660px;
  margin: 0 auto;
`;

const SectionIcon = styled.div`
  display: grid;
  width: 50px;
  height: 50px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
`;

const SectionHeading = styled.div`
  margin: 18px 0 26px;

  > span {
    color: ${({ theme }) => theme.colors.primary};
    font-size: 11px;
    font-weight: 850;
  }

  h2 {
    margin: 7px 0 8px;
    font-size: clamp(25px, 4vw, 33px);
    letter-spacing: -0.06em;
  }

  p {
    max-width: 580px;
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 13px;
    line-height: 1.65;
  }
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: grid;
  gap: 7px;
  margin-bottom: 17px;
`;

const Label = styled.label`
  color: ${({ theme }) => theme.colors.text};
  font-size: 12px;
  font-weight: 800;
`;

const Required = styled.span`
  color: ${({ theme }) => theme.colors.danger};
`;

const controlStyles = css`
  width: 100%;
  height: 52px;
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  border-radius: ${({ theme }) => theme.radius.md};
  outline: 0;
  background: ${({ theme }) => theme.colors.surfaceSoft};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  font-weight: 650;
  transition: 180ms ease;

  &::placeholder {
    color: #a0a8b6;
    font-weight: 500;
  }

  &:hover {
    border-color: #c9d7e8;
  }

  &:focus {
    border-color: rgba(36, 107, 254, 0.72);
    background: #fff;
    box-shadow: 0 0 0 4px rgba(36, 107, 254, 0.09);
  }
`;

const Input = styled.input`
  ${controlStyles}
  padding: 0 15px;
`;

const InputWithIcon = styled.div`
  position: relative;

  > svg {
    position: absolute;
    top: 50%;
    left: 15px;
    z-index: 1;
    transform: translateY(-50%);
    color: ${({ theme }) => theme.colors.muted};
    pointer-events: none;
  }

  input {
    ${controlStyles}
    padding: 0 15px 0 43px;
  }

  &:focus-within > svg {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const FieldHelp = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 10px;
  line-height: 1.45;
`;

const FieldError = styled.span`
  color: #b42318;
  font-size: 10px;
  font-weight: 700;
`;

const InfoCard = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin-top: 10px;
  padding: 15px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};

  > div {
    display: grid;
    gap: 4px;
  }

  strong {
    font-size: 11px;
  }

  span {
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 10px;
    line-height: 1.5;
  }
`;

const ReviewList = styled.div`
  display: grid;
  gap: 11px;
`;

const ReviewItem = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 13px;
  padding: 15px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.surfaceSoft};

  > div:nth-child(2) {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  span {
    color: ${({ theme }) => theme.colors.muted};
    font-size: 9px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12px;
  }

  small {
    overflow: hidden;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const ReviewIcon = styled.div`
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primary};
`;

const EditButton = styled.button`
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 10px;
  font-weight: 850;

  &:hover {
    text-decoration: underline;
  }
`;

const CreationSummary = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin-top: 16px;
  padding: 15px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.successSoft};
  color: ${({ theme }) => theme.colors.success};

  > div {
    display: grid;
    gap: 4px;
  }

  strong {
    color: #087a55;
    font-size: 11px;
  }

  span {
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 10px;
    line-height: 1.5;
  }
`;

const GeneralError = styled.div`
  margin-top: 13px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.dangerSoft};
  color: #b42318;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
`;

const FormFooter = styled.footer`
  display: flex;
  min-height: 82px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 15px 38px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 600px) {
    padding: 15px 22px;
  }
`;

const FooterHint = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 10px;
`;

const buttonStyles = css`
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 0 18px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: 12px;
  font-weight: 850;
  transition: 180ms ease;

  &:disabled {
    cursor: wait;
    opacity: 0.68;
  }
`;

const PrimaryButton = styled.button`
  ${buttonStyles}
  margin-left: auto;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  box-shadow: 0 12px 28px rgba(36, 107, 254, 0.2);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    background: ${({ theme }) => theme.colors.primaryDark};
  }

  svg[data-lucide="loader-circle"] {
    animation: ${spin} 0.8s linear infinite;
  }
`;

const SecondaryButton = styled.button`
  ${buttonStyles}
  background: ${({ theme }) => theme.colors.surfaceSoft};
  color: ${({ theme }) => theme.colors.textSoft};

  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primarySoft};
  }
`;

const SuccessContent = styled.div`
  align-self: center;
  display: grid;
  width: min(100% - 44px, 520px);
  justify-self: center;
  padding: 48px 30px;
  text-align: center;

  > span {
    margin-top: 20px;
    color: ${({ theme }) => theme.colors.success};
    font-size: 11px;
    font-weight: 850;
  }

  h2 {
    margin: 8px 0 10px;
    font-size: clamp(28px, 5vw, 38px);
    letter-spacing: -0.06em;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.colors.textSoft};
    font-size: 13px;
    line-height: 1.65;
  }
`;

const SuccessIcon = styled.div`
  display: grid;
  width: 74px;
  height: 74px;
  margin: 0 auto;
  place-items: center;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.successSoft};
  color: ${({ theme }) => theme.colors.success};
  box-shadow: 0 16px 34px rgba(16, 185, 129, 0.13);
`;

const LoadingLine = styled.div`
  height: 5px;
  margin-top: 28px;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.colors.successSoft};

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: ${({ theme }) => theme.colors.success};
    animation: ${load} 0.9s ease forwards;
  }
`;
