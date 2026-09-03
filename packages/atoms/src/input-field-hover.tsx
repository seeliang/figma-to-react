import './styles.css'

export type InputFieldHoverProps = {
  placeholderText?: string
}

export function InputFieldHover({
  placeholderText = 'Placeholder text',
}: InputFieldHoverProps = {}) {
  return (
    <input
      type="text"
      placeholder={placeholderText}
      className="f2r-ua3be5ofr6bgrakjzudl4l-16-3 f2r-ua3be5ofr6bgrakjzudl4l-16-4 f2r-ua3be5ofr6bgrakjzudl4l-16-3"
      data-figma-id="16:3"
    />
  )
}
