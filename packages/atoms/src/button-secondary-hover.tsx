import './styles.css'

export type ButtonSecondaryHoverProps = {
  buttonLabel?: string
}

export function ButtonSecondaryHover({
  buttonLabel = 'Button Label',
}: ButtonSecondaryHoverProps = {}) {
  return (
    <button type="button" className="f2r-ua3be5ofr6bgrakjzudl4l-16-7" data-figma-id="16:7">
      <span className="f2r-ua3be5ofr6bgrakjzudl4l-16-8" data-figma-id="16:8">
        {buttonLabel}
      </span>
    </button>
  )
}
