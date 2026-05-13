import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  CreateRoutineRequest,
  Routine,
  RoutineProjectTarget,
  RoutineRun,
  RoutineSchedule,
  Weekday,
} from '@open-design/contracts';

import { Icon } from './Icon';
import { navigate } from '../router';
import { useI18n } from '../i18n';

type ProjectSummary = { id: string; name: string };

type ScheduleKind = RoutineSchedule['kind'];

// Fallback list used only when the runtime doesn't expose
// `Intl.supportedValuesOf('timeZone')`. The backend validator accepts any
// IANA zone, so the picker should match — see `listSupportedTimezones`.
const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
];

function detectLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// Returns every IANA zone the platform recognizes, so the picker stays in
// sync with the backend validator (which accepts any IANA timezone). Falls
// back to a curated subset on older runtimes that lack `supportedValuesOf`.
// `UTC` is always prepended because `Intl.supportedValuesOf('timeZone')`
// returns only canonical region names on current runtimes (e.g. Node 24)
// and would otherwise drop the most common non-local zone — which the
// backend validator and contract examples still accept.
function listSupportedTimezones(): string[] {
  try {
    const fn = (Intl as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (typeof fn === 'function') {
      const list = fn('timeZone');
      if (Array.isArray(list) && list.length > 0) {
        return list.includes('UTC') ? list : ['UTC', ...list];
      }
    }
  } catch {
    // fall through
  }
  return FALLBACK_TIMEZONES;
}

// "GMT+8", "GMT-5:30", "GMT" — short label that mirrors the screenshot's
// "Shanghai (GMT+8)" pattern for legibility.
function gmtLabel(timezone: string, at = new Date()): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const part = dtf.formatToParts(at).find((p) => p.type === 'timeZoneName');
    return part?.value ?? 'GMT';
  } catch {
    return 'GMT';
  }
}

function tzCityLabel(timezone: string): string {
  if (timezone === 'UTC') return 'UTC';
  const last = timezone.split('/').pop() ?? timezone;
  return last.replace(/_/g, ' ');
}

function tzOptionLabel(timezone: string): string {
  // The GMT offset is intentionally omitted: it would drift seasonally for
  // DST-observing zones (e.g. `America/New_York` is GMT-5 in winter and
  // GMT-4 in summer) and a picker label that depends on `new Date()` is
  // misleading. The IANA city stays stable year-round.
  return tzCityLabel(timezone);
}

function formatTime12h(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const mm = m[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${suffix}`;
}

function describeSchedule(
  schedule: RoutineSchedule,
  nextRunAt: number | null | undefined,
  t: (key: string) => string,
): string {
  if (schedule.kind === 'hourly') {
    const mm = String(schedule.minute).padStart(2, '0');
    return `Runs every hour at :${mm}`;
  }
  // Anchor the GMT offset to the next actual fire time so DST-observing
  // zones don't drift seasonally — a New York routine created in winter
  // would otherwise still render `GMT-5` after DST starts. When we don't
  // know the next fire (e.g. the live preview while the form is open),
  // fall back to the IANA city, which is stable year-round.
  const tz = nextRunAt
    ? gmtLabel(schedule.timezone, new Date(nextRunAt))
    : tzCityLabel(schedule.timezone);
  if (schedule.kind === 'daily') {
    return `Runs daily at ${formatTime12h(schedule.time)} ${tz}`;
  }
  if (schedule.kind === 'weekdays') {
    return `Runs Mon–Fri at ${formatTime12h(schedule.time)} ${tz}`;
  }
  const weekdayLabels = [
    t('routines.sunday'),
    t('routines.monday'),
    t('routines.tuesday'),
    t('routines.wednesday'),
    t('routines.thursday'),
    t('routines.friday'),
    t('routines.saturday'),
  ];
  const day = weekdayLabels[schedule.weekday] ?? t('routines.sunday');
  return `Runs every ${day} at ${formatTime12h(schedule.time)} ${tz}`;
}

function formatRelative(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatRunTimestamp(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

type FormState = {
  name: string;
  prompt: string;
  kind: ScheduleKind;
  minute: number; // hourly
  time: string; // daily/weekdays/weekly (HH:MM)
  weekday: Weekday; // weekly
  timezone: string;
  mode: 'create_each_run' | 'reuse';
  projectId: string;
};

function emptyForm(): FormState {
  return {
    name: '',
    prompt: '',
    kind: 'daily',
    minute: 0,
    time: '09:00',
    weekday: 1,
    timezone: detectLocalTimezone(),
    mode: 'create_each_run',
    projectId: '',
  };
}

function buildSchedule(form: FormState): RoutineSchedule {
  if (form.kind === 'hourly') {
    return { kind: 'hourly', minute: form.minute };
  }
  if (form.kind === 'weekly') {
    return {
      kind: 'weekly',
      weekday: form.weekday,
      time: form.time,
      timezone: form.timezone,
    };
  }
  return {
    kind: form.kind,
    time: form.time,
    timezone: form.timezone,
  };
}

function StatusPill({ status, t }: { status: RoutineRun['status']; t: (key: string) => string }) {
  const statusMap: Record<RoutineRun['status'], string> = {
    succeeded: t('routines.succeeded'),
    failed: t('routines.failed'),
    running: t('routines.running'),
    cancelled: t('routines.cancelled'),
  };
  return <span className={`routines-status routines-status-${status}`}>{statusMap[status]}</span>;
}

function ScheduleEditor({
  form,
  setForm,
  timezones,
  t,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  timezones: string[];
  t: (key: string) => string;
}) {
  const SCHEDULE_KINDS: { kind: ScheduleKind; label: string }[] = [
    { kind: 'hourly', label: t('routines.hourly') },
    { kind: 'daily', label: t('routines.daily') },
    { kind: 'weekdays', label: t('routines.weekdays') },
    { kind: 'weekly', label: t('routines.weekly') },
  ];

  const WEEKDAY_LABELS: { value: Weekday; short: string; long: string }[] = [
    { value: 0, short: t('routines.sun'), long: t('routines.sunday') },
    { value: 1, short: t('routines.mon'), long: t('routines.monday') },
    { value: 2, short: t('routines.tue'), long: t('routines.tuesday') },
    { value: 3, short: t('routines.wed'), long: t('routines.wednesday') },
    { value: 4, short: t('routines.thu'), long: t('routines.thursday') },
    { value: 5, short: t('routines.fri'), long: t('routines.friday') },
    { value: 6, short: t('routines.sat'), long: t('routines.saturday') },
  ];

  return (
    <div className="routines-schedule-editor">
      <div className="routines-field-label">{t('routines.schedule')}</div>
      <div className="subtab-pill routines-kind-pills" role="tablist">
        {SCHEDULE_KINDS.map((k) => (
          <button
            type="button"
            key={k.kind}
            role="tab"
            aria-selected={form.kind === k.kind}
            className={form.kind === k.kind ? 'active' : ''}
            onClick={() => setForm({ ...form, kind: k.kind })}
          >
            {k.label}
          </button>
        ))}
      </div>

      {form.kind === 'hourly' ? (
        <div className="routines-fieldrow">
          <label className="routines-field">
            <span>{t('routines.minuteOfHour')}</span>
            <input
              type="number"
              min={0}
              max={59}
              step={1}
              value={form.minute}
              onChange={(e) =>
                setForm({
                  ...form,
                  minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)),
                })
              }
            />
          </label>
        </div>
      ) : null}

      {form.kind === 'weekly' ? (
        <div className="routines-weekday-row">
          {WEEKDAY_LABELS.map((d) => (
            <button
              type="button"
              key={d.value}
              className={`routines-weekday${form.weekday === d.value ? ' active' : ''}`}
              onClick={() => setForm({ ...form, weekday: d.value })}
              aria-pressed={form.weekday === d.value}
            >
              {d.short}
            </button>
          ))}
        </div>
      ) : null}

      {form.kind !== 'hourly' ? (
        <div className="routines-fieldrow routines-fieldrow-2col">
          <label className="routines-field">
            <span>{t('routines.time')}</span>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
            />
          </label>
          <label className="routines-field">
            <span>{t('routines.timezone')}</span>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tzOptionLabel(tz)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <p className="routines-schedule-hint">
        {describeSchedule(buildSchedule(form), undefined, t)}
      </p>
    </div>
  );
}

function RunHistory({ routineId, refreshKey, t }: { routineId: string; refreshKey: number; t: (key: string) => string }) {
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/routines/${routineId}/runs?limit=10`);
        if (!res.ok) throw new Error(`runs: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setRuns(json.runs ?? []);
      } catch {
        if (!cancelled) setRuns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routineId, refreshKey]);

  if (runs === null) return <div className="routines-history-empty">{t('routines.loadingRuns')}</div>;
  if (runs.length === 0)
    return <div className="routines-history-empty">{t('routines.noRuns')}</div>;

  return (
    <ul className="routines-history">
      {runs.map((r) => (
        <li key={r.id} className="routines-history-row">
          <StatusPill status={r.status} t={t} />
          <span className="routines-history-time">{formatRunTimestamp(r.startedAt)}</span>
          <span className="routines-history-trigger">
            {r.trigger === 'manual' ? t('routines.manual') : t('routines.scheduled')}
          </span>
          <button
            type="button"
            className="routines-history-link"
            onClick={() =>
              navigate({ kind: 'project', projectId: r.projectId, fileName: null })
            }
            title="Open the project this run wrote to"
          >
            {t('routines.openProject')}
            <Icon name="chevron-right" size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function RoutinesSection() {
  const { t } = useI18n();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  const timezones = useMemo(() => {
    const local = detectLocalTimezone();
    // Pin the user's local zone first, then expose every IANA zone the
    // backend would accept so the picker matches the validator.
    const set = new Set<string>([local, ...listSupportedTimezones()]);
    return Array.from(set);
  }, []);

  const refresh = async () => {
    try {
      const [rRes, pRes] = await Promise.all([
        fetch('/api/routines'),
        fetch('/api/projects'),
      ]);
      if (!rRes.ok) throw new Error(`routines: ${rRes.status}`);
      const rJson = await rRes.json();
      setRoutines(rJson.routines ?? []);
      if (pRes.ok) {
        const pJson = await pRes.json();
        setProjects(
          (pJson.projects ?? []).map((p: ProjectSummary) => ({
            id: p.id,
            name: p.name,
          })),
        );
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const projectsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (form.mode === 'reuse' && !form.projectId) {
        throw new Error('Pick a project to reuse, or switch to "Create new each run"');
      }
      const target: RoutineProjectTarget =
        form.mode === 'reuse' && form.projectId
          ? { mode: 'reuse', projectId: form.projectId }
          : { mode: 'create_each_run' };
      const body: CreateRoutineRequest = {
        name: form.name.trim(),
        prompt: form.prompt,
        schedule: buildSchedule(form),
        target,
        enabled: true,
      };
      const res = await fetch('/api/routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `create failed: ${res.status}`);
      }
      setShowForm(false);
      setForm(emptyForm());
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const runNow = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/routines/${id}/run`, { method: 'POST' });
      if (!res.ok && res.status !== 202) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `run failed: ${res.status}`);
      }
      void refresh();
      setExpandedId(id);
      setHistoryTick((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (routine: Routine) => {
    setBusyId(routine.id);
    try {
      const res = await fetch(`/api/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `update failed: ${res.status}`);
      }
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t('routines.deleteConfirm')))
      return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/routines/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `delete failed: ${res.status}`);
      }
      if (expandedId === id) setExpandedId(null);
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="settings-section routines-section">
      <div className="section-head">
        <div>
          <h3>{t('routines.title')}</h3>
          <p className="hint">
            {t('routines.description')}
          </p>
        </div>
        {!showForm ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setForm(emptyForm());
              setShowForm(true);
            }}
          >
            <Icon name="plus" size={14} />
            <span>{t('routines.newRoutine')}</span>
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="settings-notice error" role="alert">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={submit} className="routines-card routines-form">
          <label className="routines-field">
            <span>{t('routines.name')}</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('routines.placeholderName')}
              autoFocus
            />
          </label>
          <label className="routines-field">
            <span>{t('routines.prompt')}</span>
            <textarea
              required
              rows={4}
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              placeholder="Pull yesterday's GitHub + Linear activity and summarize what changed."
            />
          </label>

          <ScheduleEditor form={form} setForm={setForm} timezones={timezones} t={t} />

          <fieldset className="routines-fieldset">
            <legend>{t('routines.project')}</legend>
            <label className="routines-radio">
              <input
                type="radio"
                checked={form.mode === 'create_each_run'}
                onChange={() => setForm({ ...form, mode: 'create_each_run' })}
              />
              <span>
                <strong>{t('routines.newProject')}</strong>
                <small>A fresh, isolated workspace per fire.</small>
              </span>
            </label>
            <label className="routines-radio">
              <input
                type="radio"
                checked={form.mode === 'reuse'}
                onChange={() => setForm({ ...form, mode: 'reuse' })}
              />
              <span>
                <strong>{t('routines.existingProject')}</strong>
                <small>Each run lives as a new conversation inside the project.</small>
              </span>
            </label>
            {form.mode === 'reuse' ? (
              <select
                className="routines-project-select"
                value={form.projectId}
                onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                required
              >
                <option value="">— Pick a project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
          </fieldset>

          <div className="routines-form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowForm(false);
                setForm(emptyForm());
              }}
            >
              {t('routines.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? t('routines.creating') : t('routines.save')}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="routines-empty">{t('routines.loading')}</div>
      ) : routines.length === 0 ? (
        <div className="routines-empty">
          <strong>{t('routines.noRoutinesYet')}</strong>
          <p>{t('routines.noRoutinesHint')}</p>
        </div>
      ) : (
        <ul className="routines-list">
          {routines.map((r) => {
            const targetLabel =
              r.target.mode === 'reuse'
                ? `→ ${projectsById.get(r.target.projectId) ?? r.target.projectId}`
                : '→ new project each run';
            const isBusy = busyId === r.id;
            const isExpanded = expandedId === r.id;
            return (
              <li key={r.id} className={`routines-card routines-item${r.enabled ? '' : ' is-disabled'}`}>
                <div className="routines-item-head">
                  <div className="routines-item-main">
                    <div className="routines-item-title">
                      <strong>{r.name}</strong>
                      {!r.enabled ? (
                        <span className="routines-tag">paused</span>
                      ) : null}
                    </div>
                    <div className="routines-item-line">{describeSchedule(r.schedule, r.nextRunAt, t)}</div>
                    <div className="routines-item-meta">
                      <span>{targetLabel}</span>
                      <span aria-hidden>·</span>
                      <span>next: {formatRelative(r.nextRunAt)}</span>
                      {r.lastRun ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>
                            {t('routines.last')} <StatusPill status={r.lastRun.status} t={t} />{' '}
                            {formatRelative(r.lastRun.startedAt)}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="routines-item-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => runNow(r.id)}
                      disabled={isBusy}
                    >
                      {t('routines.runNow')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => toggleEnabled(r)}
                      disabled={isBusy}
                    >
                      {r.enabled ? t('routines.pause') : t('routines.resume')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? t('routines.hideHistory') : t('routines.history')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-danger"
                      onClick={() => remove(r.id)}
                      disabled={isBusy}
                      title={t('routines.deleteTitle')}
                    >
                      {t('routines.delete')}
                    </button>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="routines-item-history">
                    <RunHistory routineId={r.id} refreshKey={historyTick} t={t} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
