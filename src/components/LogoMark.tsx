interface LogoMarkProps {
  compact?: boolean;
}

export function LogoMark({ compact = false }: LogoMarkProps) {
  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <img
        src="/assets/aistudio/Logo_carr__FACTOREALM_1af2f982.png"
        alt="Logo Factorealm"
        referrerPolicy="no-referrer"
        className="h-8 w-8 rounded-md object-contain bg-white p-0.5 border border-slate-200 dark:border-slate-700"
      />
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
          <span className="text-[#081C3A] dark:text-slate-100">FACTO</span>
          <span className="text-[#0066FF] dark:text-[#3B82F6]">REALM</span>
        </span>
      )}
    </div>
  );
}
