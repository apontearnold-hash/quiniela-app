"use client"

import { useState, useEffect } from "react"

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function getTimeLeft(targetDate: string): TimeLeft {
  const diff = new Date(targetDate).getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((diff % (1000 * 60)) / 1000),
  }
}

export default function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [time, setTime] = useState<TimeLeft | null>(null)

  useEffect(() => {
    setTime(getTimeLeft(targetDate))
    const interval = setInterval(() => setTime(getTimeLeft(targetDate)), 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  if (!time) {
    return <div className="h-24" />
  }

  const units = [
    { label: "Días", value: time.days },
    { label: "Horas", value: time.hours },
    { label: "Min", value: time.minutes },
    { label: "Seg", value: time.seconds },
  ]

  return (
    <div className="flex justify-center gap-3 sm:gap-6">
      {units.map(({ label, value }, i) => (
        <div key={label} className="flex items-center gap-3 sm:gap-6">
          <div className="flex flex-col items-center">
            <div
              className="countdown-digit flex items-center justify-center w-16 h-16 sm:w-24 sm:h-24 rounded-2xl font-black text-3xl sm:text-5xl text-[#F5C518]"
              style={{ background: 'linear-gradient(135deg, #152a1a, #1a3322)', border: '2px solid #2a5438' }}
            >
              {String(value).padStart(2, "0")}
            </div>
            <span className="text-[#7ab88a] text-xs uppercase tracking-widest mt-2 font-medium">
              {label}
            </span>
          </div>
          {i < units.length - 1 && (
            <span className="text-[#F5C518] font-black text-2xl sm:text-4xl mb-6">:</span>
          )}
        </div>
      ))}
    </div>
  )
}
