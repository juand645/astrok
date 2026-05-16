const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  username: string;
  active: boolean;
  roles: string[];
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
    throw new Error("Invalid username or password.");
  }

  return response.json();
}

export async function getCurrentUser(accessToken: string): Promise<AuthUser> {
  const response = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Your session has expired.");
  }

  return response.json();
}

export type Client = {
  id: number;
  full_name: string;
  email: string;
  username: string;
  description: string | null;
  birth_date: string | null;
  relation_type: string;
  relation_description: string | null;
};

export async function fetchMyClients(accessToken: string): Promise<Client[]> {
  const response = await fetch(`${API_URL}/api/clients/`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error("Could not load clients.");
  }

  return response.json();
}

export type ClientDetail = {
  id: number;
  full_name: string;
  email: string;
  username: string;
  description: string | null;
  birth_date: string | null;
  measures: Record<string, number | string>;
  relation_type: string | null;
  relation_description: string | null;
};

export type ExerciseEntry = {
  ejercicio: string;
  repeticiones: number;
  peso: string;
  url_video: string;
};

export type PlanContent = Record<string, ExerciseEntry[]>;

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
    throw new Error("Could not load plans.");
  }
  return response.json();
}

export async function recordMeasurement(
  accessToken: string,
  clientId: number,
  measures: Record<string, number | string>,
  notes?: string,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/clients/${clientId}/measurements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ measures, notes: notes ?? null }),
  });
  if (!response.ok) {
    throw new Error("Could not save measurements.");
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
    throw new Error("Could not save plan.");
  }
  return response.json();
}

export async function updateClient(
  accessToken: string,
  clientId: number,
  payload: { description?: string | null },
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
    throw new Error("Could not save client.");
  }
  return response.json();
}
