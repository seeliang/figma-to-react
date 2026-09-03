import './styles.css'

export type ButtonPrimaryDefaultProps = {
  buttonLabel?: string
}

export function ButtonPrimaryDefault({
  buttonLabel = 'Button Label',
}: ButtonPrimaryDefaultProps = {}) {
  return (
    <button type="button" className="f2r-ua3be5ofr6bgrakjzudl4l-2-66" data-figma-id="2:66">
      <span className="f2r-ua3be5ofr6bgrakjzudl4l-2-67" data-figma-id="2:67">
        {buttonLabel}
      </span>
    </button>
  )
}
