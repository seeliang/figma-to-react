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
      className="flex justify-center items-center h-11 py-3 px-[14px] bg-white border border-blue-200 rounded-lg font-inter text-[14px] text-slate-400 w-[138px]"
    />
  )
}
