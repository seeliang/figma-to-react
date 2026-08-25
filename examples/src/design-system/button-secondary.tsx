export type ButtonSecondaryProps = {
  buttonLabel?: string
}

export function ButtonSecondary({ buttonLabel = 'Button Label' }: ButtonSecondaryProps = {}) {
  return (
    <button
      type="button"
      className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 bg-white border border-blue-200 rounded-lg"
    >
      <span className="font-inter text-[14px] font-semibold text-slate-950">{buttonLabel}</span>
    </button>
  )
}
