import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api';
import { label } from '../lib/labels';

// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800 border-teal-700',
  secondary: 'bg-white text-slate-900 hover:bg-slate-100 border-slate-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 border-red-700',
  ghost: 'bg-transparent text-teal-800 hover:bg-teal-50 border-transparent',
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
  return <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-slate-700">{children}</p>;
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
      <input id={id} type="checkbox" className="h-5 w-5 rounded border-slate-500 accent-teal-700" {...rest} />
      <label htmlFor={id} className="text-sm text-slate-800">
        {text}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------- status chips (text + icon, never colour alone)

const BOOKING_CHIPS: Record<string, { icon: string; cls: string }> = {
  requested: { icon: '◷', cls: 'bg-slate-100 text-slate-900 border-slate-400' },
  waitlisted: { icon: '⋯', cls: 'bg-amber-50 text-amber-950 border-amber-500' },
  approved: { icon: '✓', cls: 'bg-green-50 text-green-950 border-green-600' },
  rejected: { icon: '✕', cls: 'bg-red-50 text-red-950 border-red-500' },
  cancelled: { icon: '⊘', cls: 'bg-slate-100 text-slate-800 border-slate-400' },
  checked_in: { icon: '↗', cls: 'bg-sky-50 text-sky-950 border-sky-600' },
  returned: { icon: '↩', cls: 'bg-indigo-50 text-indigo-950 border-indigo-500' },
  closed: { icon: '■', cls: 'bg-slate-200 text-slate-900 border-slate-500' },
};

const DEPOSIT_CHIPS: Record<string, { icon: string; cls: string }> = {
  none: { icon: '–', cls: 'bg-slate-100 text-slate-800 border-slate-400' },
  pending: { icon: '◷', cls: 'bg-amber-50 text-amber-950 border-amber-500' },
  paid: { icon: '●', cls: 'bg-sky-50 text-sky-950 border-sky-600' },
  refunded: { icon: '↩', cls: 'bg-green-50 text-green-950 border-green-600' },
  forfeited: { icon: '✕', cls: 'bg-red-50 text-red-950 border-red-500' },
  waived: { icon: '✓', cls: 'bg-slate-100 text-slate-900 border-slate-500' },
};

const GENERIC_CHIPS: Record<string, { icon: string; cls: string }> = {
  pending: { icon: '◷', cls: 'bg-amber-50 text-amber-950 border-amber-500' },
  verified: { icon: '✓', cls: 'bg-green-50 text-green-950 border-green-600' },
  rejected: { icon: '✕', cls: 'bg-red-50 text-red-950 border-red-500' },
  expired: { icon: '⌛', cls: 'bg-slate-100 text-slate-900 border-slate-500' },
  open: { icon: '!', cls: 'bg-red-50 text-red-950 border-red-500' },
  under_review: { icon: '◷', cls: 'bg-amber-50 text-amber-950 border-amber-500' },
  resolved: { icon: '✓', cls: 'bg-green-50 text-green-950 border-green-600' },
  requested: { icon: '◷', cls: 'bg-slate-100 text-slate-900 border-slate-400' },
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
  const c = GENERIC_CHIPS[status] ?? { icon: '•', cls: 'bg-slate-100 text-slate-900 border-slate-400' };
  return <Chip {...c} text={text ?? label(status)} />;
}

export function OverdueChip() {
  return <Chip icon="⚠" cls="bg-red-100 text-red-950 border-red-600" text="Overdue" />;
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Chip icon="✓" cls="bg-teal-50 text-teal-950 border-teal-600" text="Verified organisation" />
  ) : (
    <Chip icon="◷" cls="bg-amber-50 text-amber-950 border-amber-500" text="Not verified yet" />
  );
}

// ---------------------------------------------------------------- layout helpers

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        {intro && <div className="mt-1 max-w-3xl text-slate-700">{intro}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, children, actions, id }: { title: string; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section className="card" aria-labelledby={id}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-bold text-slate-900">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-sm font-semibold text-slate-700">{k}</dt>
          <dd className="text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('textarea, input, select, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
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
