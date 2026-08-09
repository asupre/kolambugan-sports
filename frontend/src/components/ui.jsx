// Reusable UI primitives — defined once, reused everywhere for a consistent look.
// Later these are the seams we swap for shadcn.

export function Button({ variant = "primary", className = "", ...props }) {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary: "border border-slate-300 text-slate-700 hover:bg-slate-50",
    success: "bg-green-600 text-white hover:bg-green-700",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      className={`rounded-lg text-sm font-medium px-4 py-2.5 transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-300 bg-white text-slate-900 px-3 py-2.5 text-sm placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition ${className}`}
      {...props}
    />
  );
}

export function Label({ children, className = "" }) {
  return (
    <label className={`block text-slate-700 text-sm font-medium mb-1.5 ${className}`}>
      {children}
    </label>
  );
}

export function Pill({ color = "slate", children }) {
  const colors = {
    slate: "bg-slate-100 text-slate-500",
    indigo: "bg-indigo-50 text-indigo-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${colors[color]}`}>
      {children}
    </span>
  );
}