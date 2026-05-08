export function formatOffsetDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffset = Math.abs(offsetMinutes)
  const offsetHours = pad(Math.floor(absoluteOffset / 60))
  const offsetMins = pad(absoluteOffset % 60)

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHours}${offsetMins}`
}

export function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000)
}
