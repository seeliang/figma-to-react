export type ButtonGhostHoverProps = {
  buttonLabel?: string
}

export function ButtonGhostHover({ buttonLabel = 'Button Label' }: ButtonGhostHoverProps = {}) {
  return (
    <button
      type="button"
      className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 bg-neutral-50 rounded-lg cursor-pointer"
      data-figma-id="16:9"
    >
      <span
        className="w-max font-inter text-[14px] leading-[16.94px] text-blue-600"
        data-figma-id="16:10"
      >
        {buttonLabel}
      </span>
    </button>
  )
}
