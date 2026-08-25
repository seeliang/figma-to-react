export type InputFieldErrorProps = {
  invalidInput?: string
}

export function InputFieldError({ invalidInput = 'Invalid input' }: InputFieldErrorProps = {}) {
  return (
    <div className="flex justify-center items-center h-11 py-3 px-[14px] bg-white border border-[#ef4444] rounded-lg">
      <p className="self-stretch flex-1 h-full text-[14px] text-slate-400">{invalidInput}</p>
    </div>
  )
}
