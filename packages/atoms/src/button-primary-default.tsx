export type ButtonPrimaryDefaultProps = {
  buttonLabel?: string
}

export function ButtonPrimaryDefault({
  buttonLabel = 'Button Label',
}: ButtonPrimaryDefaultProps = {}) {
  return (
    <button
      type="button"
      className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 bg-blue-600 rounded-lg cursor-pointer"
      data-figma-id="2:66"
    >
      <span
        className="w-max font-inter text-[14px] leading-[16.94px] font-semibold text-white"
        data-figma-id="2:67"
      >
        {buttonLabel}
      </span>
    </button>
  )
}
