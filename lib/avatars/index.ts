import { faceSvg } from "./face";
import {
  DEFAULT_SVG, SW_C3PO, SW_VADER, HP_VOLDEMORT, LOTR_SAURON, LOTR_GANDALF,
} from "./custom";

export type Saga = "lotr" | "bigbang" | "starwars" | "hp";
export type CharAvatar = { id: string; name: string; saga: Saga; svg: string };

export const SAGAS: { key: Saga; label: string }[] = [
  { key: "lotr", label: "El Señor de los Anillos" },
  { key: "bigbang", label: "The Big Bang Theory" },
  { key: "starwars", label: "Star Wars" },
  { key: "hp", label: "Harry Potter" },
];

export const DEFAULT_AVATAR_ID = "default";

export const AVATARS: CharAvatar[] = [
  // El Señor de los Anillos
  { id: "lotr-gandalf", name: "Gandalf", saga: "lotr", svg: LOTR_GANDALF },
  { id: "lotr-gimli", name: "Gimli", saga: "lotr",
    svg: faceSvg({ bg: "#5a3a24", skin: "#e2b48c", hair: "long", hairColor: "#a63d1e", beard: "long", accent: "#6b4a2a" }) },
  { id: "lotr-legolas", name: "Legolas", saga: "lotr",
    svg: faceSvg({ bg: "#3f5a3f", skin: "#f0d6bf", hair: "long", hairColor: "#e8d9a0", accent: "#4a6a4a" }) },
  { id: "lotr-frodo", name: "Frodo", saga: "lotr",
    svg: faceSvg({ bg: "#4a6a4a", skin: "#f0d6bf", hair: "short", hairColor: "#5a3a2a", accent: "#6b5a3a" }) },
  { id: "lotr-sam", name: "Sam", saga: "lotr",
    svg: faceSvg({ bg: "#7a6a3a", skin: "#f0d0b0", hair: "swoop", hairColor: "#b06a2a", accent: "#8a6a3a" }) },
  { id: "lotr-sauron", name: "Sauron", saga: "lotr", svg: LOTR_SAURON },

  // The Big Bang Theory
  { id: "bb-sheldon", name: "Sheldon", saga: "bigbang",
    svg: faceSvg({ bg: "#c94f3a", skin: "#f2d0a8", hair: "short", hairColor: "#6b4a2a", accent: "#d96a3a",
      extra: `<path d="M44 82l6 8 6-8-6-4z" fill="#ffd23f"/>` }) },
  { id: "bb-leonard", name: "Leonard", saga: "bigbang",
    svg: faceSvg({ bg: "#3a6ea5", skin: "#eec9a8", hair: "short", hairColor: "#3a2a1a", glasses: true, accent: "#7a4a2a" }) },
  { id: "bb-rajesh", name: "Rajesh", saga: "bigbang",
    svg: faceSvg({ bg: "#7a4fa5", skin: "#b07a4a", hair: "short", hairColor: "#1c1410", accent: "#4a3a5a" }) },
  { id: "bb-howard", name: "Howard", saga: "bigbang",
    svg: faceSvg({ bg: "#3a8a6a", skin: "#eec9a8", hair: "bob", hairColor: "#2a1a10", accent: "#c94f3a",
      extra: `<rect x="46" y="66" width="8" height="4" rx="1" fill="#ffd23f"/>` }) },
  { id: "bb-penny", name: "Penny", saga: "bigbang",
    svg: faceSvg({ bg: "#d98fb0", skin: "#f2d0b0", hair: "long", hairColor: "#e8c060", accent: "#c96a8a" }) },
  { id: "bb-amy", name: "Amy", saga: "bigbang",
    svg: faceSvg({ bg: "#8a7a3a", skin: "#eec9a8", hair: "long", hairColor: "#5a3a2a", glasses: true, accent: "#6a5a2a" }) },

  // Star Wars
  { id: "sw-anakin", name: "Anakin", saga: "starwars",
    svg: faceSvg({ bg: "#6a3a2a", skin: "#eec9a8", hair: "long", hairColor: "#7a5a2a", accent: "#3a2a1a" }) },
  { id: "sw-luke", name: "Luke", saga: "starwars",
    svg: faceSvg({ bg: "#c98a2a", skin: "#eec9a8", hair: "swoop", hairColor: "#b0863a", accent: "#d8cca0" }) },
  { id: "sw-han", name: "Han Solo", saga: "starwars",
    svg: faceSvg({ bg: "#5a4a3a", skin: "#eec9a8", hair: "short", hairColor: "#4a3320", accent: "#8a7a5a" }) },
  { id: "sw-c3po", name: "C-3PO", saga: "starwars", svg: SW_C3PO },
  { id: "sw-vader", name: "Darth Vader", saga: "starwars", svg: SW_VADER },
  { id: "sw-obiwan", name: "Obi-Wan", saga: "starwars",
    svg: faceSvg({ bg: "#8a6a3a", skin: "#eec9a8", hair: "long", hairColor: "#b0895a", beard: "full", beardColor: "#b0895a", accent: "#a08a5a" }) },

  // Harry Potter
  { id: "hp-harry", name: "Harry", saga: "hp",
    svg: faceSvg({ bg: "#6a1f2a", skin: "#eec9a8", hair: "swoop", hairColor: "#1c1410", glasses: true, accent: "#3a3a3a",
      extra: `<path d="M46 32l3 5-3 3 3 3" fill="none" stroke="#b23a3a" stroke-width="1.6"/>` }) },
  { id: "hp-hermione", name: "Hermione", saga: "hp",
    svg: faceSvg({ bg: "#7a5a2a", skin: "#eec9a8", hair: "long", hairColor: "#6b3a1a", accent: "#3a3a3a" }) },
  { id: "hp-ron", name: "Ron", saga: "hp",
    svg: faceSvg({ bg: "#c96a2a", skin: "#f0d0b0", hair: "short", hairColor: "#c85a1a", accent: "#3a3a3a" }) },
  { id: "hp-dumbledore", name: "Dumbledore", saga: "hp",
    svg: faceSvg({ bg: "#3a4a7a", skin: "#e8c9a8", hair: "long", hairColor: "#e8ebee", beard: "long", beardColor: "#e8ebee", glasses: true, glassesColor: "#8a7a3a", accent: "#5a4a8a" }) },
  { id: "hp-snape", name: "Snape", saga: "hp",
    svg: faceSvg({ bg: "#22262a", skin: "#dcd0c0", hair: "long", hairColor: "#141414", accent: "#141414" }) },
  { id: "hp-voldemort", name: "Voldemort", saga: "hp", svg: HP_VOLDEMORT },
];

export const byId: Map<string, string> = new Map<string, string>([
  [DEFAULT_AVATAR_ID, DEFAULT_SVG],
  ...AVATARS.map((a) => [a.id, a.svg] as [string, string]),
]);
