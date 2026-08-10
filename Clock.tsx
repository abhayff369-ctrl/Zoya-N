import { useEffect, useState } from "react";

export default function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-right leading-tight hidden sm:block">
      <p className="font-mono text-sm md:text-base text-white/85 tracking-widest">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </p>
      <p className="text-[10px] text-white/35 tracking-[0.2em] uppercase">
        {now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
      </p>
    </div>
  );
}
