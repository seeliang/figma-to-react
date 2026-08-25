export type InputFieldErrorProps = {
  invalidInput?: string
}

export function InputFieldError({ invalidInput = 'Invalid input' }: InputFieldErrorProps = {}) {
  return (
    <input
      type="text"
      placeholder={invalidInput}
      className="flex justify-center items-center h-11 py-3 px-[14px] bg-white border border-[#ef4444] rounded-lg text-[14px] text-slate-400"
    />
  )
}
