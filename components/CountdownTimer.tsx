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
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
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

  if (!time) return <div style={{ height: "96px" }} />

  const units = [
    { label: "Días",  value: time.days },
    { label: "Horas", value: time.hours },
    { label: "Min",   value: time.minutes },
    { label: "Seg",   value: time.seconds },
  ]

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: "8px" }}>
      {units.map(({ label, value }, i) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
              width: "72px",
              height: "72px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "30px",
              fontWeight: 900,
              color: "#0f172a",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.01em",
            }}>
              {String(value).padStart(2, "0")}
            </div>
            <span style={{
              color: "#94a3b8",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginTop: "6px",
              fontWeight: 600,
            }}>
              {label}
            </span>
          </div>
          {i < units.length - 1 && (
            <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: "22px", marginBottom: "22px" }}>
              :
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
