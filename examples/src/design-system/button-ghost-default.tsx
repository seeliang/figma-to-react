export type ButtonGhostDefaultProps = {
  buttonLabel?: string
}

export function ButtonGhostDefault({ buttonLabel = 'Button Label' }: ButtonGhostDefaultProps = {}) {
  return (
    <button
      type="button"
      className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 rounded-lg cursor-pointer"
      data-figma-id="2:70"
    >
      <span
        className="w-max font-inter text-[14px] leading-[16.94px] text-blue-600"
        data-figma-id="2:71"
      >
        {buttonLabel}
      </span>
    </button>
  )
}
