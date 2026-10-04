import type { ReactNode } from 'react'

export const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 ' +
  'aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/20'

const baseLabel = 'mb-1 block text-sm font-medium text-slate-700'

interface FieldProps {
  id: string
  label: string
  error?: string
  hint?: string
  /** Visually hide the label (it stays available to screen readers); 'md' hides it from the md breakpoint up. */
  hideLabel?: boolean | 'md'
  className?: string
  children: ReactNode
}

/** Label + control + inline error. The control must use `id` and `fieldA11y(id, error)`. */
export function Field({ id, label, error, hint, hideLabel, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel === true ? 'sr-only' : `${baseLabel}${hideLabel === 'md' ? ' md:sr-only' : ''}`}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function fieldA11y(id: string, error?: string, hint?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const
}
