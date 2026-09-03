import './styles.css'

export type InputFieldFocusedProps = {
  inputValue?: string
}

export function InputFieldFocused({ inputValue = 'Input value' }: InputFieldFocusedProps = {}) {
  return (
    <input
      type="text"
      placeholder={inputValue}
      className="f2r-ua3be5ofr6bgrakjzudl4l-2-61 f2r-ua3be5ofr6bgrakjzudl4l-2-62 f2r-ua3be5ofr6bgrakjzudl4l-2-61"
      data-figma-id="2:61"
    />
  )
}
