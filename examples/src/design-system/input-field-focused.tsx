export type InputFieldFocusedProps = {
  inputValue?: string
}

export function InputFieldFocused({ inputValue = 'Input value' }: InputFieldFocusedProps = {}) {
  return (
    <div className="flex justify-center items-center h-11 py-3 px-[14px] bg-white border border-blue-600 rounded-lg">
      <p className="self-stretch flex-1 h-full text-[14px] text-slate-400">{inputValue}</p>
    </div>
  )
}
