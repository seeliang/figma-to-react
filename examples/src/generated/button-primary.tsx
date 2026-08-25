export type ButtonPrimaryProps = {
  label?: string
}

export function ButtonPrimary({ label = 'View more' }: ButtonPrimaryProps = {}) {
  return (
    <div className="flex justify-center items-center py-2 px-4 bg-blue-600 rounded-md">
      <p className="text-[14px] leading-[20px] font-medium text-center text-[#ffffff]">{label}</p>
    </div>
  )
}
