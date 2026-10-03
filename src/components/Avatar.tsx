import clsx from "clsx";
import { initials } from "../lib/format";

export function Avatar({ name, color, size = "md", ring }: { name: string; color: string; size?: "xs" | "sm" | "md"; ring?: boolean }) {
  return (
    <span
      title={name}
      style={{ backgroundColor: color }}
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white",
        size === "xs" && "size-5 text-[9px]",
        size === "sm" && "size-6 text-[10px]",
        size === "md" && "size-8 text-xs",
        ring && "ring-2 ring-white",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 5 }: { people: { name: string; color: string }[]; max?: number }) {
  return (
    <span className="flex -space-x-1.5">
      {people.slice(0, max).map((p) => <Avatar key={p.name} name={p.name} color={p.color} size="sm" ring />)}
      {people.length > max && (
        <span className="inline-grid size-6 place-items-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600 ring-2 ring-white">
          +{people.length - max}
        </span>
      )}
    </span>
  );
}
