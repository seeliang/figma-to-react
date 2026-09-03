export type ButtonPrimaryHoverProps = {
  buttonLabel?: string
}

export function ButtonPrimaryHover({ buttonLabel = 'Button Label' }: ButtonPrimaryHoverProps = {}) {
  return (
    <button
      type="button"
      className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 bg-blue-600 rounded-lg shadow-[inset_0px_0px_0px_100px_rgba(0,0,0,0.12)] cursor-pointer"
      data-figma-id="16:5"
    >
      <span
        className="w-max font-inter text-[14px] leading-[16.94px] font-semibold text-white"
        data-figma-id="16:6"
      >
        {buttonLabel}
      </span>
    </button>
  )
}
