import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string | null
  rightSlot?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, rightSlot, id, className, ...rest },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="field-control-wrap">
        <input
          id={inputId}
          ref={ref}
          className={['input', rightSlot ? 'input-with-icon-right' : '', className].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {rightSlot}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  )
})
