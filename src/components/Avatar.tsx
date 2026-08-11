interface AvatarProps {
  url: string | null
  label: string
  className?: string
}

export function Avatar({ url, label, className = 'h-8 w-8' }: AvatarProps) {
  if (url) {
    return <img src={url} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  }

  const initial = label.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-accent/15 font-display font-medium text-accent`}
    >
      {initial}
    </div>
  )
}
