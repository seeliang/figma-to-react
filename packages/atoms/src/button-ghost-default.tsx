import './styles.css'

export type ButtonGhostDefaultProps = {
  buttonLabel?: string
}

export function ButtonGhostDefault({ buttonLabel = 'Button Label' }: ButtonGhostDefaultProps = {}) {
  return (
    <button type="button" className="f2r-ua3be5ofr6bgrakjzudl4l-2-70" data-figma-id="2:70">
      <span className="f2r-ua3be5ofr6bgrakjzudl4l-2-71" data-figma-id="2:71">
        {buttonLabel}
      </span>
    </button>
  )
}
