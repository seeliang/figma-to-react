export type InputFieldFocusedProps = {
  inputValue?: string
}

export function InputFieldFocused({ inputValue = 'Input value' }: InputFieldFocusedProps = {}) {
  return (
    <input
      type="text"
      placeholder={inputValue}
      className="flex justify-center items-center h-11 py-3 px-[14px] bg-white border border-blue-600 rounded-lg text-[14px] text-slate-400"
    />
  )
}
