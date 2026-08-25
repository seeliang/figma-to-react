export type ButtonGhostProps = {
  buttonLabel?: string
}

export function ButtonGhost({ buttonLabel = 'Button Label' }: ButtonGhostProps = {}) {
  return (
    <button
      type="button"
      className="flex justify-center items-center w-90 h-[46px] py-[14px] px-6 rounded-lg"
    >
      <span className="text-[14px] text-blue-600">{buttonLabel}</span>
    </button>
  )
}
