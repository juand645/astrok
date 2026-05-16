import { useState } from "react";
import { CalendarDays, Dumbbell, Send, Users } from "lucide-react";
import { ExerciseBlock, generateRoutineDraft } from "../../api";

const stats = [
  { label: "Today appointments", value: "12", icon: CalendarDays },
  { label: "Active clients", value: "84", icon: Users },
  { label: "Routine drafts", value: "7", icon: Dumbbell },
];

const appointments = [
  { time: "07:00", client: "Ana Morales", trainer: "Carlos", focus: "Strength baseline" },
  { time: "09:30", client: "Luis Vega", trainer: "Mariana", focus: "Mobility review" },
  { time: "18:00", client: "Sofia Rojas", trainer: "Carlos", focus: "Hypertrophy block" },
];

type DashboardModuleProps = {
  title?: string;
  description?: string;
};

export function DashboardModule({
  title = "Appointments and routine planning",
  description = "Manage the day, draft client routines, and keep instructors in control.",
}: DashboardModuleProps) {
  const [goal, setGoal] = useState("increase strength and improve body composition");
  const [days, setDays] = useState(3);
  const [draft, setDraft] = useState<ExerciseBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setIsLoading(true);
    setError(null);

    try {
      const routine = await generateRoutineDraft({
        client_id: 1,
        instructor_id: 2,
        goal,
        experience_level: "beginner",
        days_per_week: days,
        limitations: ["avoid high-impact jumps"],
        available_equipment: ["dumbbells", "cable machine", "leg press"],
      });
      setDraft(routine.plan);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button className="primary-button">
          <CalendarDays size={18} />
          New appointment
        </button>
      </header>

      <section className="stats-grid" aria-label="Overview">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <article className="metric-card" key={item.label}>
              <Icon size={20} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          );
        })}
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Schedule</h2>
            <span>Today</span>
          </div>
          <div className="appointment-list">
            {appointments.map((appointment) => (
              <article className="appointment-row" key={`${appointment.time}-${appointment.client}`}>
                <time>{appointment.time}</time>
                <div>
                  <strong>{appointment.client}</strong>
                  <span>
                    {appointment.trainer} - {appointment.focus}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>AI routine draft</h2>
            <span>Instructor review</span>
          </div>

          <label className="field">
            <span>Client goal</span>
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={3} />
          </label>

          <label className="field">
            <span>Days per week</span>
            <input
              min={1}
              max={7}
              type="number"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            />
          </label>

          <button className="primary-button full-width" onClick={handleGenerate} disabled={isLoading}>
            <Send size={18} />
            {isLoading ? "Generating..." : "Generate draft"}
          </button>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="routine-list">
            {draft.map((block) => (
              <article className="routine-card" key={block.day}>
                <div>
                  <strong>{block.day}</strong>
                  <span>{block.focus}</span>
                </div>
                <ul>
                  {block.exercises.map((exercise) => (
                    <li key={exercise}>{exercise}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
