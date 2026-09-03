import { InputFieldDefault } from '@ds/atoms'

export type FormFieldProps = {
  label?: string
  placeholderText?: string
}

export function FormField({
  label = 'Label',
  placeholderText = 'Placeholder text',
}: FormFieldProps = {}) {
  return (
    <div className="flex flex-col items-start gap-[6px] w-90">
      <p
        className="self-stretch w-full font-inter text-[13px] leading-[15.73px] font-medium text-slate-950"
        data-figma-id="2:74"
      >
        {label}
      </p>
      <div className="h-11" data-figma-id="2:75">
        <InputFieldDefault placeholderText={placeholderText} />
      </div>
    </div>
  )
}
