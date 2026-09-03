import './styles.css'

export type InputFieldDefaultProps = {
  placeholderText?: string
}

export function InputFieldDefault({
  placeholderText = 'Placeholder text',
}: InputFieldDefaultProps = {}) {
  return (
    <input
      type="text"
      placeholder={placeholderText}
      className="f2r-ua3be5ofr6bgrakjzudl4l-2-59 f2r-ua3be5ofr6bgrakjzudl4l-2-60 f2r-ua3be5ofr6bgrakjzudl4l-2-59"
      data-figma-id="2:59"
    />
  )
}
