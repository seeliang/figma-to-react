export type InputFieldFocusedProps = {
  inputValue?: string
}

export function InputFieldFocused({ inputValue = 'Input value' }: InputFieldFocusedProps = {}) {
  return (
    <input
      type="text"
      placeholder={inputValue}
      className="flex justify-center items-center h-11 py-3 px-[14px] bg-white border border-blue-600 rounded-lg font-inter text-[14px] leading-[16.94px] text-slate-400 w-[103px]"
      data-figma-id="2:61"
    />
  )
}
