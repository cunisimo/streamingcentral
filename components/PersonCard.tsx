"use client";
import Link from "next/link";
import type { UIPerson } from "@/lib/types";

export default function PersonCard({ p }: { p: UIPerson }) {
  const initials = p.name.split(" ").map((n) => n[0]).slice(0, 2).join("");
  return (
    <Link href={`/persona/${p.id}`} className="pcard">
      <div className="av" style={p.profile ? { backgroundImage: `url(${p.profile})` } : { background: "#5A3340" }}>
        {!p.profile && initials}
      </div>
      <div className="nm">{p.name}</div>
      {p.knownFor[0] && <div className="sb">{p.knownFor[0]}</div>}
    </Link>
  );
}
