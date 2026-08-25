import { InputFieldDefault } from './input-field-default.js'

export type FormFieldProps = {
  label?: string
  placeholderText?: string
}

export function FormField({
  label = 'Label',
  placeholderText = 'Placeholder text',
}: FormFieldProps = {}) {
  return (
    <div className="flex flex-col gap-[6px] w-90">
      <p className="self-stretch w-full font-inter text-[13px] font-medium text-slate-950">
        {label}
      </p>
      <div className="self-stretch h-11">
        <InputFieldDefault placeholderText={placeholderText} />
      </div>
    </div>
  )
}
