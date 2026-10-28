import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api';
import { label } from '../lib/labels';

// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark border-brand',
  secondary: 'bg-white text-ink hover:bg-slate-100 border-slate-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 border-red-700',
  ghost: 'bg-transparent text-brand hover:bg-brand-light border-transparent',
};

export function Button({
  variant = 'primary',
  busy,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function LinkButton({ to, children, variant = 'primary' }: { to: string; children: ReactNode; variant?: Variant }) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold no-underline hover:no-underline ${VARIANTS[variant]}`}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------- feedback

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${small ? 'h-4 w-4' : 'h-6 w-6'}`}
    />
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-slate-700">
      <Spinner />
      <span>{what}…</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 bg-mist-soft px-4 py-5 text-center text-slate-700">{children}</p>;
}

type Tone = 'info' | 'success' | 'warning' | 'error';
const TONES: Record<Tone, { box: string; icon: string; title: string }> = {
  info: { box: 'border-sky-300 bg-sky-50 text-sky-950', icon: 'ℹ', title: 'Note' },
  success: { box: 'border-green-300 bg-green-50 text-green-950', icon: '✓', title: 'Done' },
  warning: { box: 'border-amber-400 bg-amber-50 text-amber-950', icon: '!', title: 'Heads up' },
  error: { box: 'border-red-300 bg-red-50 text-red-950', icon: '✕', title: 'Blocked' },
};

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-md border p-3 ${t.box}`}>
      <span aria-hidden="true" className="mt-0.5 font-bold">
        {t.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title ?? t.title}</p>
        <div className="mt-1 text-sm">{children}</div>
      </div>
    </div>
  );
}

/** Shows an API error in plain words, with the rule that blocked it and a next step where we know one. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError) {
    const missing = (error.details?.missing as string[] | undefined) ?? [];
    return (
      <Alert tone="error" title={error.status === 422 ? 'This rule blocked it' : 'That did not work'}>
        <p>{error.message}</p>
        {error.rule === 'eligibility' && missing.length > 0 && (
          <p className="mt-2">
            {missing.map((k) => (
              <Link key={k} to={`/profile/verify?kind=${k}`} className="mr-3 font-semibold">
                Request {label(k)} verification →
              </Link>
            ))}
          </p>
        )}
        {error.status === 401 && (
          <p className="mt-2">
            <Link to="/signin">Sign in again</Link>
          </p>
        )}
      </Alert>
    );
  }
  return <Alert tone="error">{String((error as Error)?.message ?? error)}</Alert>;
}

// ---------------------------------------------------------------- form fields

interface FieldProps {
  label: string;
  hint?: ReactNode;
  required?: boolean;
}

export function TextField({ label: text, hint, required, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate-800">
        {text}
        {required && <span className="font-normal text-slate-600"> (required)</span>}
      </label>
      <input id={id} required={required} aria-describedby={hint ? id + '-hint' : undefined} className="input" {...rest} />
      {hint && (
        <p id={id + '-hint'} className="mt-1 text-sm text-slate-600">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({ label: text, hint, required, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate-800">
        {text}
        {required && <span className="font-normal text-slate-600"> (required)</span>}
      </label>
      <textarea id={id} required={required} rows={3} aria-describedby={hint ? id + '-hint' : undefined} className="input" {...rest} />
      {hint && (
        <p id={id + '-hint'} className="mt-1 text-sm text-slate-600">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label: text,
  hint,
  required,
  children,
  ...rest
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-slate-800">
        {text}
        {required && <span className="font-normal text-slate-600"> (required)</span>}
      </label>
      <select id={id} required={required} aria-describedby={hint ? id + '-hint' : undefined} className="input" {...rest}>
        {children}
      </select>
      {hint && (
        <p id={id + '-hint'} className="mt-1 text-sm text-slate-600">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label: text, ...rest }: { label: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className="h-5 w-5 rounded border-slate-500 accent-brand" {...rest} />
      <label htmlFor={id} className="text-sm text-slate-800">
        {text}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- status chips (text + icon, never colour alone)

const BOOKING_CHIPS: Record<string, { icon: string; cls: string }> = {
  requested: { icon: '◷', cls: 'bg-slate-100 text-ink border-slate-400' },
  waitlisted: { icon: '⋯', cls: 'bg-amber-50 text-amber-950 border-amber-500' },
  approved: { icon: '✓', cls: 'bg-green-50 text-green-950 border-green-600' },
  rejected: { icon: '✕', cls: 'bg-red-50 text-red-950 border-red-500' },
  cancelled: { icon: '⊘', cls: 'bg-slate-100 text-slate-800 border-slate-400' },
  checked_in: { icon: '↗', cls: 'bg-sky-50 text-sky-950 border-sky-600' },
  returned: { icon: '↩', cls: 'bg-indigo-50 text-indigo-950 border-indigo-500' },
  closed: { icon: '■', cls: 'bg-slate-200 text-ink border-slate-500' },
};

const DEPOSIT_CHIPS: Record<string, { icon: string; cls: string }> = {
  none: { icon: '–', cls: 'bg-slate-100 text-slate-800 border-slate-400' },
  pending: { icon: '◷', cls: 'bg-amber-50 text-amber-950 border-amber-500' },
  paid: { icon: '●', cls: 'bg-sky-50 text-sky-950 border-sky-600' },
  refunded: { icon: '↩', cls: 'bg-green-50 text-green-950 border-green-600' },
  forfeited: { icon: '✕', cls: 'bg-red-50 text-red-950 border-red-500' },
  waived: { icon: '✓', cls: 'bg-slate-100 text-ink border-slate-500' },
};

const GENERIC_CHIPS: Record<string, { icon: string; cls: string }> = {
  pending: { icon: '◷', cls: 'bg-amber-50 text-amber-950 border-amber-500' },
  verified: { icon: '✓', cls: 'bg-green-50 text-green-950 border-green-600' },
  rejected: { icon: '✕', cls: 'bg-red-50 text-red-950 border-red-500' },
  expired: { icon: '⌛', cls: 'bg-slate-100 text-ink border-slate-500' },
  open: { icon: '!', cls: 'bg-red-50 text-red-950 border-red-500' },
  under_review: { icon: '◷', cls: 'bg-amber-50 text-amber-950 border-amber-500' },
  resolved: { icon: '✓', cls: 'bg-green-50 text-green-950 border-green-600' },
  requested: { icon: '◷', cls: 'bg-slate-100 text-ink border-slate-400' },
  approved: { icon: '✓', cls: 'bg-green-50 text-green-950 border-green-600' },
  active: { icon: '✓', cls: 'bg-green-50 text-green-950 border-green-600' },
  suspended: { icon: '⊘', cls: 'bg-red-50 text-red-950 border-red-500' },
};

function Chip({ icon, cls, text }: { icon: string; cls: string; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-semibold ${cls}`}>
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const c = BOOKING_CHIPS[status] ?? BOOKING_CHIPS.requested;
  return <Chip {...c} text={label(status)} />;
}

export function DepositChip({ status }: { status: string }) {
  const c = DEPOSIT_CHIPS[status] ?? DEPOSIT_CHIPS.none;
  return <Chip {...c} text={status === 'none' ? 'No deposit' : 'Deposit ' + label(status).toLowerCase()} />;
}

export function StateChip({ status, text }: { status: string; text?: string }) {
  const c = GENERIC_CHIPS[status] ?? { icon: '•', cls: 'bg-slate-100 text-ink border-slate-400' };
  return <Chip {...c} text={text ?? label(status)} />;
}

export function OverdueChip() {
  return <Chip icon="⚠" cls="bg-red-100 text-red-950 border-red-600" text="Overdue" />;
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Chip icon="✓" cls="bg-brand-light text-ink border-brand" text="Verified organisation" />
  ) : (
    <Chip icon="◷" cls="bg-amber-50 text-amber-950 border-amber-500" text="Not verified yet" />
  );
}

// ---------------------------------------------------------------- layout helpers

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        {intro && <div className="mt-1 max-w-3xl text-slate-700">{intro}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  children,
  actions,
  id,
  intro,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  id?: string;
  intro?: ReactNode;
}) {
  return (
    <section className="card scroll-mt-24" aria-labelledby={id ? id + '-title' : undefined} id={id}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id ? id + '-title' : undefined} className="text-lg font-bold text-ink">
            {title}
          </h2>
          {intro && <div className="mt-1 text-sm text-slate-700">{intro}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** A heading that groups several sections on a page. */
export function GroupHeading({ title, intro, id }: { title: string; intro?: ReactNode; id?: string }) {
  return (
    <div id={id} className="scroll-mt-24 border-l-4 border-accent pl-3">
      <h2 className="text-xl font-bold text-ink">{title}</h2>
      {intro && <p className="text-sm text-slate-700">{intro}</p>}
    </div>
  );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-sm font-semibold text-slate-700">{k}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- tabs

export interface TabDef {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

/**
 * Accessible tabs (tablist, tab, tabpanel; arrow keys, Home and End move between tabs). The selected tab lives in
 * the URL as ?tab=<id> so links and the browser's back button can target it.
 */
export function Tabs({ tabs, label: ariaLabel, param = 'tab' }: { tabs: TabDef[]; label: string; param?: string }) {
  const [params, setParams] = useSearchParams();
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const location = useLocation();
  // ?tab= wins; an old-style #section link also selects its tab
  const requested = params.get(param) ?? (location.hash ? location.hash.slice(1) : null);
  const current = tabs.find((t) => t.id === requested) ?? tabs[0];

  const select = (id: string, focus = false) => {
    const next = new URLSearchParams(params);
    if (id === tabs[0].id) next.delete(param);
    else next.set(param, id);
    setParams(next, { replace: true, preventScrollReset: true });
    if (focus) refs.current[tabs.findIndex((t) => t.id === id)]?.focus();
  };

  const onKey = (e: ReactKeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const to =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (to === null) return;
    e.preventDefault();
    select(tabs[to].id, true);
  };

  return (
    <div>
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b border-slate-300">
        {tabs.map((t, i) => {
          const selected = t.id === current.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`-mb-px min-h-[44px] whitespace-nowrap rounded-t-md border-b-[3px] px-4 py-2 text-sm font-semibold ${
                selected ? 'border-brand bg-mist text-ink' : 'border-transparent text-slate-700 hover:bg-white hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-${current.id}`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
        tabIndex={0}
        className="pt-5 focus-visible:outline-offset-4"
      >
        {current.content}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- waitlist

/**
 * A waitlisted booking's stored reason is a snapshot taken when the request was made and never changes; the
 * live position is worked out on every load. They are labelled apart so they never look like a contradiction.
 */
export function WaitlistInfo({
  reason,
  position,
  size,
  explanation,
  compact,
  staff,
}: {
  reason: string | null;
  position: number;
  size: number;
  explanation?: string;
  compact?: boolean;
  /** staff read about someone else's request */
  staff?: boolean;
}) {
  return (
    <div className={compact ? 'mt-2 space-y-1 text-sm' : 'space-y-2'}>
      <p className="font-semibold text-amber-950">
        {staff ? 'Position now' : 'Your position now'}: number {position} of {size}
      </p>
      {reason && (
        <p className="text-slate-700">
          <span className="font-semibold">{staff ? 'When it was waitlisted' : 'At the time of your request'}:</span> “{reason}”
        </p>
      )}
      {explanation && !compact && <p className="text-sm text-slate-700">{explanation}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- dialog

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // callers pass a new onClose on every render; keep the latest in a ref so focus is set only once
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], form textarea, form input, form select, form button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-2xl leading-none text-slate-700 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
