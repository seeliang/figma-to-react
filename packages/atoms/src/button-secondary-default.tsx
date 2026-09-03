import './styles.css'

export type ButtonSecondaryDefaultProps = {
  buttonLabel?: string
}

export function ButtonSecondaryDefault({
  buttonLabel = 'Button Label',
}: ButtonSecondaryDefaultProps = {}) {
  return (
    <button type="button" className="f2r-ua3be5ofr6bgrakjzudl4l-2-68" data-figma-id="2:68">
      <span className="f2r-ua3be5ofr6bgrakjzudl4l-2-69" data-figma-id="2:69">
        {buttonLabel}
      </span>
    </button>
  )
}
