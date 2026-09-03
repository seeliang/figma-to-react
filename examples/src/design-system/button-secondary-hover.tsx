export type ButtonSecondaryHoverProps = {
  buttonLabel?: string
}

export function ButtonSecondaryHover({
  buttonLabel = 'Button Label',
}: ButtonSecondaryHoverProps = {}) {
  return (
    <button
      type="button"
      className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 bg-neutral-50 border border-blue-200 rounded-lg cursor-pointer"
      data-figma-id="16:7"
    >
      <span
        className="w-max font-inter text-[14px] leading-[16.94px] font-semibold text-slate-950"
        data-figma-id="16:8"
      >
        {buttonLabel}
      </span>
    </button>
  )
}
