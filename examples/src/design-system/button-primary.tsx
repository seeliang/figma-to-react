export type ButtonPrimaryProps = {
  buttonLabel?: string
}

export function ButtonPrimary({ buttonLabel = 'Button Label' }: ButtonPrimaryProps = {}) {
  return (
    <button
      type="button"
      className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 bg-blue-600 rounded-lg"
    >
      <span className="text-[14px] font-semibold text-white">{buttonLabel}</span>
    </button>
  )
}
