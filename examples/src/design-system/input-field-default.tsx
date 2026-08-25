export type InputFieldDefaultProps = {
  placeholderText?: string
}

export function InputFieldDefault({
  placeholderText = 'Placeholder text',
}: InputFieldDefaultProps = {}) {
  return (
    <div className="flex justify-center items-center h-11 py-3 px-[14px] bg-white border border-blue-200 rounded-lg">
      <p className="self-stretch flex-1 h-full text-[14px] text-slate-400">{placeholderText}</p>
    </div>
  )
}
