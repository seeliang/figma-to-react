import { ButtonPrimary } from './button-primary.js'

export type CardProps = {
  title?: string
  body?: string
  label?: string
}

export function Card({
  title = 'Monthly report',
  body = 'Revenue grew 12% against last quarter.',
  label = 'View more',
}: CardProps = {}) {
  return (
    <div className="flex flex-col items-start gap-4 w-80 p-6 bg-surface-raised border border-[#e6e8eb] rounded-lg overflow-hidden shadow-[0px_2px_8px_0px_rgba(0,0,0,0.08)]">
      <div className="flex justify-between items-center gap-2 w-full">
        <h3 className="text-[18px] leading-[24px] font-semibold tracking-[-0.2px] text-heading-small">
          {title}
        </h3>
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </div>
      <p className="w-full text-[14px] leading-[20px] text-[#4a5463]">{body}</p>
      <ButtonPrimary label={label} />
    </div>
  )
}
