import './styles.css'

export type ButtonGhostHoverProps = {
  buttonLabel?: string
}

export function ButtonGhostHover({ buttonLabel = 'Button Label' }: ButtonGhostHoverProps = {}) {
  return (
    <button type="button" className="f2r-ua3be5ofr6bgrakjzudl4l-16-9" data-figma-id="16:9">
      <span className="f2r-ua3be5ofr6bgrakjzudl4l-16-10" data-figma-id="16:10">
        {buttonLabel}
      </span>
    </button>
  )
}
