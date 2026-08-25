export type ButtonSecondaryProps = {
  buttonLabel?: string
}

export function ButtonSecondary({ buttonLabel = 'Button Label' }: ButtonSecondaryProps = {}) {
  return (
    <div className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 bg-white border border-blue-200 rounded-lg">
      <p className="text-[14px] font-semibold text-slate-950">{buttonLabel}</p>
    </div>
  )
}
