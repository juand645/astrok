const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function notifyIfSessionExpired(response: Response): void {
  if (response.status === 401) {
    window.dispatchEvent(new Event("auth:expired"));
  }
}

export type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  username: string;
  personal_number: string | null;
  id_number: string | null;
  birth_date: string | null;
  description: string | null;
  active: boolean;
  roles: string[];
  professional_id: number | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
};

export type RoutineDraftRequest = {
  client_id: number;
  instructor_id: number;
  goal: string;
  experience_level: string;
  days_per_week: number;
  limitations: string[];
  available_equipment: string[];
};

export type ExerciseBlock = {
  day: string;
  focus: string;
  exercises: string[];
  notes?: string | null;
};

export type RoutineDraft = {
  client_id: number;
  instructor_id: number;
  title: string;
  goal: string;
  plan: ExerciseBlock[];
};

export async function generateRoutineDraft(payload: RoutineDraftRequest): Promise<RoutineDraft> {
  const response = await fetch(`${API_URL}/api/routines/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not generate routine draft.");
  }

  return response.json();
}

export async function login(identifier: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });

  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Invalid username or password.");
  }

  return response.json();
}

export type ProfileUpdatePayload = {
  full_name?: string;
  email?: string;
  personal_number?: string | null;
  id_number?: string | null;
  birth_date?: string | null;
  description?: string | null;
};

export async function updateMyProfile(
  accessToken: string,
  payload: ProfileUpdatePayload,
): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not update profile.");
  }
  return response.json();
}

export async function changePassword(
  accessToken: string,
  payload: { current_password: string; new_password: string },
): Promise<void> {
  const response = await fetch(`${API_URL}/api/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not change password.");
  }
}

export async function getCurrentUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Your session has expired.");
  }

  return response.json();
}

export type Client = {
  id: number;
  full_name: string;
  email: string;
  username: string;
  personal_number: string | null;
  id_number: string | null;
  description: string | null;
  birth_date: string | null;
  relation_type: string;
  relation_description: string | null;
  professional_id: number | null;
  professional_name: string | null;
};

export async function fetchMyClients(accessToken: string): Promise<Client[]> {
  const response = await fetch(`${API_URL}/api/clients/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load clients.");
  }

  return response.json();
}

export type ClientDetail = {
  id: number;
  full_name: string;
  email: string;
  username: string;
  personal_number: string | null;
  id_number: string | null;
  description: string | null;
  birth_date: string | null;
  measures: Record<string, number | string>;
  relation_type: string | null;
  relation_description: string | null;
};

export type ExerciseEntry = {
  ejercicio: string;
  series?: number;
  repeticiones: number;
  peso: string;
  url_video: string;
};

export type Circuito = {
  series: number;
  exercises: ExerciseEntry[];
};

export type PlanContent = Record<string, Circuito[]>;

export type LegacyPlanContent = Record<string, ExerciseEntry[]>;

export function flattenDayContent(
  value: Circuito[] | ExerciseEntry[] | undefined | null,
): ExerciseEntry[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const first = value[0] as { exercises?: unknown };
  const isCircuitShape = first && typeof first === "object" && Array.isArray(first.exercises);
  if (!isCircuitShape) {
    return value as ExerciseEntry[];
  }
  const flat: ExerciseEntry[] = [];
  for (const circuito of value as Circuito[]) {
    for (const exercise of circuito.exercises) {
      flat.push({ ...exercise, series: circuito.series });
    }
  }
  return flat;
}

export type PlanSummary = {
  id: number;
  client_id: number;
  professional_id: number;
  appointment_id: number | null;
  plan_type: string;
  title: string;
  content: PlanContent;
  status: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchClientDetail(
  accessToken: string,
  clientId: number,
): Promise<ClientDetail> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load client detail.");
  }
  return response.json();
}

export async function fetchClientPlans(
  accessToken: string,
  clientId: number,
): Promise<PlanSummary[]> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}/plans`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load plans.");
  }
  return response.json();
}

export type MeasurementSaveResponse = {
  entry: { id: number; recorded_at: string } | null;
  measures: Record<string, number | string>;
};

export async function recordMeasurement(
  accessToken: string,
  clientId: number,
  payload: {
    measures: Record<string, number | string>;
    removed?: string[];
    notes?: string;
  },
): Promise<MeasurementSaveResponse> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}/measurements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      measures: payload.measures,
      removed: payload.removed ?? [],
      notes: payload.notes ?? null,
    }),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ??"Could not save measurements.");
  }
  return response.json();
}

export type CreatePlanPayload = {
  client_id: number;
  title: string;
  plan_type?: string;
  content?: PlanContent;
  description?: string | null;
  status?: string;
  appointment_id?: number | null;
  change_note?: string | null;
};

export async function createPlan(
  accessToken: string,
  payload: CreatePlanPayload,
): Promise<PlanSummary> {
  const response = await fetch(`${API_URL}/api/plans/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ??"Could not create plan.");
  }
  return response.json();
}

export type ParQQuestion = {
  id: string;
  text: string;
};

export type ParQAnswer = {
  id: string;
  text: string;
  answer: "yes" | "no";
  follow_up?: string | null;
};

export type ParQResponses = {
  questions: ParQAnswer[];
  any_yes: boolean;
  client_acknowledgement: string;
  submitted_at: string;
};

export type ParQAssessment = {
  id: number;
  client_id: number;
  requested_by: number;
  requested_at: string;
  completed_at: string | null;
  status: "requested" | "completed" | "expired";
  responses: ParQResponses | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchParQQuestions(accessToken: string): Promise<ParQQuestion[]> {
  const response = await fetch(`${API_URL}/api/par-q/questions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load PAR-Q questions.");
  }
  return response.json();
}

export async function fetchClientParQList(
  accessToken: string,
  clientId: number,
): Promise<ParQAssessment[]> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}/par-q`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load PAR-Q assessments.");
  }
  return response.json();
}

export async function enableParQ(
  accessToken: string,
  clientId: number,
): Promise<ParQAssessment> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}/par-q`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not enable PAR-Q.");
  }
  return response.json();
}

export async function submitParQ(
  accessToken: string,
  assessmentId: number,
  payload: { answers: ParQAnswer[]; client_acknowledgement: string },
): Promise<ParQAssessment> {
  const response = await fetch(`${API_URL}/api/par-q/${assessmentId}/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not submit PAR-Q.");
  }
  return response.json();
}

export async function deletePlan(
  accessToken: string,
  planId: number,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/plans/${planId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not delete plan.");
  }
}

export async function updatePlan(
  accessToken: string,
  planId: number,
  payload: {
    content?: PlanContent;
    description?: string | null;
    status?: string;
    title?: string;
    change_note?: string;
  },
): Promise<PlanSummary> {
  const response = await fetch(`${API_URL}/api/plans/${planId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not save plan.");
  }
  return response.json();
}

export type NewPlanPayload = {
  title: string;
  plan_type?: string;
  status?: string;
  description?: string | null;
  content?: PlanContent;
};

export type CreateClientPayload = {
  full_name: string;
  email: string;
  username: string;
  password: string;
  personal_number?: string | null;
  id_number?: string | null;
  birth_date?: string | null;
  description?: string | null;
  measures?: Record<string, number | string>;
  relation_description?: string | null;
  plans?: NewPlanPayload[];
};

export async function createClient(
  accessToken: string,
  payload: CreateClientPayload,
): Promise<ClientDetail> {
  const response = await fetch(`${API_URL}/api/clients/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ??"Could not create client.");
  }
  return response.json();
}

export type PerformanceEntry = {
  ejercicio: string;
  peso: string;
  repeticiones: number;
  notes?: string;
};

export type WorkoutSession = {
  id: number;
  plan_id: number;
  client_id: number;
  recorded_by: number | null;
  day_key: string;
  session_date: string;
  completed: boolean;
  completed_at: string | null;
  performance: PerformanceEntry[];
  rating: number | null;
  notes: string | null;
  ai_response: string | null;
  created_at: string;
  updated_at: string;
};

export type CoachMessageResponse = {
  message: string | null;
  cached: boolean;
  reason: string | null;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DraftExercise = {
  ejercicio: string;
  repeticiones: number;
  peso: string;
  url_video: string;
};

export type PlanDraft = {
  title: string;
  description: string | null;
  content: Record<string, DraftExercise[]>;
};

export type CoachChatResponse = {
  message: ChatMessage;
  plan: PlanDraft | null;
  reason: string | null;
};

export async function sendCoachChatTurn(
  accessToken: string,
  clientId: number,
  messages: ChatMessage[],
): Promise<CoachChatResponse> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}/coach-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not reach the plan coach.");
  }
  return response.json();
}

export async function fetchCoachMessage(
  accessToken: string,
  clientId: number,
  sessionId: number,
): Promise<CoachMessageResponse> {
  const response = await fetch(
    `${API_URL}/api/clients/${clientId}/sessions/${sessionId}/coach-message`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load coach message.");
  }
  return response.json();
}

export type WorkoutSessionInput = {
  plan_id: number;
  day_key: string;
  performance: PerformanceEntry[];
  completed?: boolean;
  rating?: number | null;
  notes?: string | null;
  session_date?: string | null;
};

export async function fetchSessions(
  accessToken: string,
  clientId: number,
  opts?: { planId?: number; dayKey?: string; limit?: number },
): Promise<WorkoutSession[]> {
  const params = new URLSearchParams();
  if (opts?.planId !== undefined) params.set("plan_id", String(opts.planId));
  if (opts?.dayKey !== undefined) params.set("day_key", opts.dayKey);
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_URL}/api/clients/${clientId}/sessions${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load sessions.");
  }
  return response.json();
}

export async function logSession(
  accessToken: string,
  clientId: number,
  payload: WorkoutSessionInput,
): Promise<WorkoutSession> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ??"Could not save session.");
  }
  return response.json();
}

export type Appointment = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: "requested" | "confirmed" | "cancelled" | "completed";
  focus: string;
  notes: string | null;
  client_id: number;
  professional_id: number;
};

export type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
};

export type AppointmentCreatePayload = {
  starts_at: string;
  client_id?: number | null;
  professional_id?: number | null;
  focus?: string;
  notes?: string | null;
};

export async function fetchMyAppointments(
  accessToken: string,
  opts?: { startsAfter?: string; startsBefore?: string },
): Promise<Appointment[]> {
  const params = new URLSearchParams();
  if (opts?.startsAfter) params.set("starts_after", opts.startsAfter);
  if (opts?.startsBefore) params.set("starts_before", opts.startsBefore);
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`${API_URL}/api/appointments/me${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load appointments.");
  }
  return response.json();
}

export async function fetchAvailability(
  accessToken: string,
  professionalId: number,
  opts?: { startsAfter?: string; startsBefore?: string },
): Promise<AvailabilitySlot[]> {
  const params = new URLSearchParams();
  if (opts?.startsAfter) params.set("starts_after", opts.startsAfter);
  if (opts?.startsBefore) params.set("starts_before", opts.startsBefore);
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(
    `${API_URL}/api/appointments/availability/${professionalId}${query}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not load availability.");
  }
  return response.json();
}

export async function bookAppointment(
  accessToken: string,
  payload: AppointmentCreatePayload,
): Promise<Appointment> {
  const response = await fetch(`${API_URL}/api/appointments/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ??"Could not book the appointment.");
  }
  return response.json();
}

export async function cancelAppointment(
  accessToken: string,
  appointmentId: number,
): Promise<Appointment> {
  const response = await fetch(`${API_URL}/api/appointments/${appointmentId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status: "cancelled" }),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ??"Could not cancel the appointment.");
  }
  return response.json();
}

export async function updateClient(
  accessToken: string,
  clientId: number,
  payload: {
    description?: string | null;
    personal_number?: string | null;
    id_number?: string | null;
    relation_description?: string | null;
  },
): Promise<ClientDetail> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    throw new Error("Could not save client.");
  }
  return response.json();
}

export type DashboardStats = {
  active_clients: number;
  active_plans: number;
  sessions_this_week: number;
  appointments_this_week: number;
};

export type DashboardAppointment = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: "requested" | "confirmed" | "cancelled" | "completed";
  focus: string;
  client_id: number;
  client_name: string;
  client_username: string;
};

export type DashboardDraftPlan = {
  id: number;
  title: string;
  updated_at: string;
  client_id: number;
  client_name: string;
};

export type DashboardParQAlert = {
  assessment_id: number;
  completed_at: string | null;
  client_id: number;
  client_name: string;
};

export type TrainerDashboard = {
  stats: DashboardStats;
  upcoming_appointments: DashboardAppointment[];
  draft_plans: DashboardDraftPlan[];
  par_q_alerts: DashboardParQAlert[];
};

export async function fetchTrainerDashboard(accessToken: string): Promise<TrainerDashboard> {
  const response = await fetch(`${API_URL}/api/dashboard/trainer`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not load dashboard.");
  }
  return response.json();
}

export type UserSummary = {
  id: number;
  full_name: string;
  username: string;
  roles: string[];
};

export async function fetchProfessionals(accessToken: string): Promise<UserSummary[]> {
  const response = await fetch(`${API_URL}/api/users/professionals`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not load professionals.");
  }
  return response.json();
}

export async function transferClient(
  accessToken: string,
  clientId: number,
  payload: { new_professional_id: number; note?: string | null },
): Promise<ClientDetail> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}/transfer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    notifyIfSessionExpired(response);
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail ?? "Could not transfer client.");
  }
  return response.json();
}
