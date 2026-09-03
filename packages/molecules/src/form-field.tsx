import './styles.css'
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
    <div className="f2r-ua3be5ofr6bgrakjzudl4l-2-73">
      <p className="f2r-ua3be5ofr6bgrakjzudl4l-2-74" data-figma-id="2:74">
        {label}
      </p>
      <div className="f2r-ua3be5ofr6bgrakjzudl4l-2-75" data-figma-id="2:75">
        <InputFieldDefault placeholderText={placeholderText} />
      </div>
    </div>
  )
}
