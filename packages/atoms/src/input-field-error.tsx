import './styles.css'

export type InputFieldErrorProps = {
  invalidInput?: string
}

export function InputFieldError({ invalidInput = 'Invalid input' }: InputFieldErrorProps = {}) {
  return (
    <input
      type="text"
      placeholder={invalidInput}
      className="f2r-ua3be5ofr6bgrakjzudl4l-2-63 f2r-ua3be5ofr6bgrakjzudl4l-2-64 f2r-ua3be5ofr6bgrakjzudl4l-2-63"
      data-figma-id="2:63"
    />
  )
}
