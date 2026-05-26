import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Save, Search, X } from "lucide-react";
import {
  Appointment,
  AppointmentCreatePayload,
  AuthUser,
  AvailabilitySlot,
  Client,
  bookAppointment,
  cancelAppointment,
  fetchAvailability,
  fetchMyAppointments,
  fetchMyClients,
} from "../../api";

type Props = {
  accessToken: string;
  currentUser: AuthUser;
};

const OPEN_HOUR = 5;
const CLOSE_HOUR = 19;
const MAX_WEEKS_AHEAD = 4;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SlotState = "available" | "mine" | "busy" | "past";

type SlotInfo = {
  state: SlotState;
  appointment: Appointment | null;
  date: Date;
};

export function AppointmentsModule({ accessToken, currentUser }: Props) {
  const isPureClient =
    currentUser.roles.length > 0 && currentUser.roles.every((role) => role === "client");

  if (isPureClient) {
    if (!currentUser.professional_id) {
      return (
        <section className="module-stack" aria-label="Appointments">
          <header className="module-header">
            <div>
              <h1>Appointments</h1>
            </div>
          </header>
          <p className="muted">
            You don&apos;t have an assigned professional yet. Once a trainer is assigned to you,
            you&apos;ll be able to book here.
          </p>
        </section>
      );
    }

    return (
      <ClientView
        accessToken={accessToken}
        clientId={currentUser.id}
        professionalId={currentUser.professional_id}
      />
    );
  }

  return <TrainerView accessToken={accessToken} currentUser={currentUser} />;
}

function ClientView({
  accessToken,
  clientId,
  professionalId,
}: {
  accessToken: string;
  clientId: number;
  professionalId: number;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()));
  const [busy, setBusy] = useState<AvailabilitySlot[]>([]);
  const [mine, setMine] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Appointment | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  async function loadWeek() {
    setIsLoading(true);
    setError(null);
    try {
      const [busyList, mineList] = await Promise.all([
        fetchAvailability(accessToken, professionalId, {
          startsAfter: weekStart.toISOString(),
          startsBefore: weekEnd.toISOString(),
        }),
        fetchMyAppointments(accessToken, {
          startsAfter: weekStart.toISOString(),
          startsBefore: weekEnd.toISOString(),
        }),
      ]);
      setBusy(busyList);
      setMine(mineList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load appointments.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, accessToken, professionalId]);

  const slotMap = useMemo(
    () => buildSlotMap(weekStart, busy, mine, clientId),
    [weekStart, busy, mine, clientId],
  );

  async function confirmBooking(focus: string, notes: string) {
    if (!selectedSlot) return;
    try {
      await bookAppointment(accessToken, {
        starts_at: selectedSlot.toISOString(),
        focus: focus.trim() || undefined,
        notes: notes.trim() || null,
      });
      setSelectedSlot(null);
      await loadWeek();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book.");
    }
  }

  async function confirmCancel() {
    if (!pendingCancel) return;
    try {
      await cancelAppointment(accessToken, pendingCancel.id);
      setPendingCancel(null);
      await loadWeek();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    }
  }

  return (
    <section className="module-stack" aria-label="Appointments">
      <header className="module-header">
        <div>
          <h1>Appointments</h1>
          <p>Book a slot with your trainer. One-hour sessions, 5 AM – 7 PM.</p>
        </div>
      </header>

      <WeekNavigator weekStart={weekStart} onChange={setWeekStart} />

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading ? <p className="muted">Loading…</p> : null}

      <WeekGrid
        weekStart={weekStart}
        slotMap={slotMap}
        onSelectAvailable={(date) => setSelectedSlot(date)}
        onSelectMine={(appointment) => setPendingCancel(appointment)}
      />

      {selectedSlot ? (
        <BookDialog
          date={selectedSlot}
          onConfirm={confirmBooking}
          onCancel={() => setSelectedSlot(null)}
        />
      ) : null}

      {pendingCancel ? (
        <CancelDialog
          appointment={pendingCancel}
          onConfirm={confirmCancel}
          onClose={() => setPendingCancel(null)}
        />
      ) : null}
    </section>
  );
}

function TrainerView({
  accessToken,
  currentUser,
}: {
  accessToken: string;
  currentUser: AuthUser;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfIsoWeek(new Date()));
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Appointment | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  async function loadWeek() {
    setIsLoading(true);
    setError(null);
    try {
      const [appts, clientList] = await Promise.all([
        fetchMyAppointments(accessToken, {
          startsAfter: weekStart.toISOString(),
          startsBefore: weekEnd.toISOString(),
        }),
        clients.length === 0 ? fetchMyClients(accessToken) : Promise.resolve(clients),
      ]);
      setAppointments(appts);
      if (clients.length === 0) setClients(clientList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load appointments.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, accessToken]);

  const slotMap = useMemo(
    () => buildSlotMap(weekStart, [], appointments, currentUser.id, true),
    [weekStart, appointments, currentUser.id],
  );

  async function confirmBooking(clientId: number, focus: string, notes: string) {
    if (!selectedSlot) return;
    try {
      const payload: AppointmentCreatePayload = {
        starts_at: selectedSlot.toISOString(),
        client_id: clientId,
        focus: focus.trim() || undefined,
        notes: notes.trim() || null,
      };
      await bookAppointment(accessToken, payload);
      setSelectedSlot(null);
      await loadWeek();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book.");
    }
  }

  async function confirmCancel() {
    if (!pendingCancel) return;
    try {
      await cancelAppointment(accessToken, pendingCancel.id);
      setPendingCancel(null);
      await loadWeek();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    }
  }

  return (
    <section className="module-stack" aria-label="Appointments">
      <header className="module-header">
        <div>
          <h1>Appointments</h1>
          <p>Your week. Click an open slot to book a client; click a booked slot to manage it.</p>
        </div>
      </header>

      <WeekNavigator weekStart={weekStart} onChange={setWeekStart} />

      {error ? <p className="error-text">{error}</p> : null}
      {isLoading ? <p className="muted">Loading…</p> : null}

      <WeekGrid
        weekStart={weekStart}
        slotMap={slotMap}
        onSelectAvailable={(date) => setSelectedSlot(date)}
        onSelectMine={(appointment) => setPendingCancel(appointment)}
      />

      {selectedSlot ? (
        <TrainerBookDialog
          date={selectedSlot}
          clients={clients}
          onConfirm={confirmBooking}
          onCancel={() => setSelectedSlot(null)}
        />
      ) : null}

      {pendingCancel ? (
        <CancelDialog
          appointment={pendingCancel}
          clients={clients}
          onConfirm={confirmCancel}
          onClose={() => setPendingCancel(null)}
        />
      ) : null}
    </section>
  );
}

// ---------- shared ----------

function WeekNavigator({
  weekStart,
  onChange,
}: {
  weekStart: Date;
  onChange: (next: Date) => void;
}) {
  const currentWeek = startOfIsoWeek(new Date());
  const maxWeek = addDays(currentWeek, 7 * MAX_WEEKS_AHEAD);
  const canGoBack = weekStart > currentWeek;
  const canGoForward = weekStart < maxWeek;

  const end = addDays(weekStart, 6);
  const label = `${formatShortDate(weekStart)} – ${formatShortDate(end)}`;

  return (
    <div className="week-nav">
      <button
        type="button"
        className="icon-button"
        onClick={() => canGoBack && onChange(addDays(weekStart, -7))}
        disabled={!canGoBack}
        aria-label="Previous week"
      >
        <ChevronLeft size={18} />
      </button>
      <strong className="week-nav-label">{label}</strong>
      <button
        type="button"
        className="icon-button"
        onClick={() => canGoForward && onChange(addDays(weekStart, 7))}
        disabled={!canGoForward}
        aria-label="Next week"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function WeekGrid({
  weekStart,
  slotMap,
  onSelectAvailable,
  onSelectMine,
}: {
  weekStart: Date;
  slotMap: Map<string, SlotInfo>;
  onSelectAvailable: (date: Date) => void;
  onSelectMine: (appointment: Appointment) => void;
}) {
  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = OPEN_HOUR; h <= CLOSE_HOUR - 1; h++) out.push(h);
    return out;
  }, []);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  function handleClick(info: SlotInfo) {
    if (info.state === "available") onSelectAvailable(info.date);
    else if (info.state === "mine" && info.appointment) onSelectMine(info.appointment);
  }

  return (
    <div className="week-grid-wrap">
      <table className="week-grid">
        <thead>
          <tr>
            <th aria-label="Hour" />
            {days.map((day, i) => (
              <th key={i}>
                <div className="day-head">
                  <span>{DAY_LABELS[i]}</span>
                  <strong>{day.getDate()}</strong>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <th scope="row" className="hour-label">
                {formatHour(hour)}
              </th>
              {days.map((day, dayIndex) => {
                const slotKey = `${dayIndex}-${hour}`;
                const info = slotMap.get(slotKey) ?? {
                  state: "available" as SlotState,
                  appointment: null,
                  date: dateAt(day, hour),
                };
                return (
                  <td key={dayIndex} className={`slot slot-${info.state}`}>
                    <button
                      type="button"
                      className="slot-button"
                      onClick={() => handleClick(info)}
                      disabled={info.state === "past" || info.state === "busy"}
                      aria-label={`${formatShortDate(day)} ${formatHour(hour)} — ${info.state}`}
                    >
                      {info.state === "mine" && info.appointment ? (
                        <span className="slot-label">Booked</span>
                      ) : info.state === "busy" ? (
                        <span className="slot-label">Booked</span>
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BookDialog({
  date,
  onConfirm,
  onCancel,
}: {
  date: Date;
  onConfirm: (focus: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onConfirm(focus, notes);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Book this slot</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <p className="muted">{formatLongDateTime(date)}</p>
        <label className="field">
          <span>Focus (optional)</span>
          <input
            type="text"
            value={focus}
            placeholder="e.g. Strength"
            onChange={(e) => setFocus(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Save size={16} /> {submitting ? "Booking…" : "Book"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrainerBookDialog({
  date,
  clients,
  onConfirm,
  onCancel,
}: {
  date: Date;
  clients: Client[];
  onConfirm: (clientId: number, focus: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [clientId, setClientId] = useState<number | null>(clients[0]?.id ?? null);
  const [clientSearch, setClientSearch] = useState("");
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredClients = useMemo(() => {
    const term = clientSearch.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter(
      (c) =>
        c.full_name.toLowerCase().includes(term) ||
        c.username.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term),
    );
  }, [clients, clientSearch]);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const selectedHiddenByFilter =
    selectedClient !== null && !filteredClients.some((c) => c.id === clientId);

  async function handleSubmit() {
    if (clientId === null) return;
    setSubmitting(true);
    try {
      await onConfirm(clientId, focus, notes);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Book a client</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <p className="muted">{formatLongDateTime(date)}</p>
        {clients.length === 0 ? (
          <p className="error-text">You don&apos;t have any clients assigned.</p>
        ) : (
          <label className="field">
            <span>Client</span>
            <div className="search-field">
              <Search size={16} />
              <input
                type="search"
                value={clientSearch}
                placeholder="Search by name, username, or email"
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </div>
            {selectedHiddenByFilter && selectedClient ? (
              <p className="muted picker-selected">
                Selected: <strong>{selectedClient.full_name}</strong>
              </p>
            ) : null}
            <div className="client-picker-list" role="listbox" aria-label="Choose a client">
              {filteredClients.length === 0 ? (
                <p className="muted center">No clients match your search.</p>
              ) : (
                filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={c.id === clientId}
                    className={`client-picker-item ${c.id === clientId ? "active" : ""}`}
                    onClick={() => setClientId(c.id)}
                  >
                    <strong>{c.full_name}</strong>
                    <span className="muted">@{c.username}</span>
                  </button>
                ))
              )}
            </div>
          </label>
        )}
        <label className="field">
          <span>Focus (optional)</span>
          <input
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={submitting || clientId === null}
          >
            <Save size={16} /> {submitting ? "Booking…" : "Book"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CancelDialog({
  appointment,
  clients,
  onConfirm,
  onClose,
}: {
  appointment: Appointment;
  clients?: Client[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const clientName = clients?.find((c) => c.id === appointment.client_id)?.full_name;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>Appointment</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="muted">{formatLongDateTime(new Date(appointment.starts_at))}</p>
        {clientName ? <p>With: <strong>{clientName}</strong></p> : null}
        {appointment.focus ? <p>Focus: {appointment.focus}</p> : null}
        {appointment.notes ? <p className="muted">{appointment.notes}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="primary-button danger"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Cancelling…" : "Cancel appointment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- helpers ----------

function buildSlotMap(
  weekStart: Date,
  busy: AvailabilitySlot[],
  mine: Appointment[] | Appointment[],
  selfId: number,
  trainerMode: boolean = false,
): Map<string, SlotInfo> {
  const map = new Map<string, SlotInfo>();
  const now = new Date();

  for (let d = 0; d < 7; d++) {
    const day = addDays(weekStart, d);
    for (let h = OPEN_HOUR; h <= CLOSE_HOUR - 1; h++) {
      const date = dateAt(day, h);
      const key = `${d}-${h}`;
      const isPast = date <= now;
      map.set(key, {
        state: isPast ? "past" : "available",
        appointment: null,
        date,
      });
    }
  }

  for (const slot of busy) {
    const start = new Date(slot.starts_at);
    const d = isoDayIndex(start, weekStart);
    const h = start.getHours();
    if (d < 0 || d > 6 || h < OPEN_HOUR || h > CLOSE_HOUR - 1) continue;
    const key = `${d}-${h}`;
    const existing = map.get(key);
    if (existing && existing.state !== "past") {
      map.set(key, { ...existing, state: "busy" });
    }
  }

  for (const appt of mine as Appointment[]) {
    const start = new Date(appt.starts_at);
    const d = isoDayIndex(start, weekStart);
    const h = start.getHours();
    if (d < 0 || d > 6 || h < OPEN_HOUR || h > CLOSE_HOUR - 1) continue;
    const key = `${d}-${h}`;
    const existing = map.get(key);
    if (!existing) continue;
    // Mine if I'm the client (client view) OR if I'm the professional (trainer view)
    const isMine = trainerMode
      ? appt.professional_id === selfId
      : appt.client_id === selfId;
    if (isMine) {
      map.set(key, { state: "mine", appointment: appt, date: existing.date });
    } else if (existing.state !== "past") {
      map.set(key, { ...existing, state: "busy", appointment: appt });
    }
  }

  return map;
}

function startOfIsoWeek(reference: Date): Date {
  const d = new Date(reference);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + shift);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dateAt(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function isoDayIndex(date: Date, weekStart: Date): number {
  const ms = startOfDay(date).getTime() - startOfDay(weekStart).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:00 ${suffix}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLongDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
