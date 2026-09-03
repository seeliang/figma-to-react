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
      className="flex justify-center items-center h-11 py-3 px-[14px] bg-neutral-50 border border-blue-200 rounded-lg font-inter text-[14px] leading-[16.94px] text-slate-400 w-[138px]"
      data-figma-id="16:3"
    />
  )
}
