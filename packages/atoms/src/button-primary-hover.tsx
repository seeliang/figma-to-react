import './styles.css'

export type ButtonPrimaryHoverProps = {
  buttonLabel?: string
}

export function ButtonPrimaryHover({ buttonLabel = 'Button Label' }: ButtonPrimaryHoverProps = {}) {
  return (
    <button type="button" className="f2r-ua3be5ofr6bgrakjzudl4l-16-5" data-figma-id="16:5">
      <span className="f2r-ua3be5ofr6bgrakjzudl4l-16-6" data-figma-id="16:6">
        {buttonLabel}
      </span>
    </button>
  )
}
