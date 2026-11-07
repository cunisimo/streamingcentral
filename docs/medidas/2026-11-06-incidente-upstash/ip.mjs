// ¿16.216.88.0/24 está en las listas oficiales de rastreadores? Sólo lee listas públicas.
import dns from "node:dns/promises";
const FUENTES = {
  "Google goog.json (todo Google)": "https://www.gstatic.com/ipranges/goog.json",
  "Google cloud.json (clientes de Cloud)": "https://www.gstatic.com/ipranges/cloud.json",
  "Google googlebot": "https://developers.google.com/static/search/apis/ipranges/googlebot.json",
  "Google common-crawlers": "https://developers.google.com/static/search/apis/ipranges/special-crawlers.json",
  "Google user-triggered-fetchers": "https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json",
  "Google user-triggered-fetchers-google": "https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers-google.json",
  "Google common-crawlers (nueva)": "https://developers.google.com/static/crawling/ipranges/common-crawlers.json",
  "Google special-crawlers (nueva)": "https://developers.google.com/static/crawling/ipranges/special-crawlers.json",
  "Google user-fetchers (nueva)": "https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers.json",
  "Bing bingbot": "https://www.bing.com/toolbox/bingbot.json",
  "OpenAI gptbot": "https://openai.com/gptbot.json",
  "OpenAI searchbot": "https://openai.com/searchbot.json",
  "OpenAI chatgpt-user": "https://openai.com/chatgpt-user.json",
  "Perplexity bot": "https://www.perplexity.ai/perplexitybot.json",
  "Perplexity user": "https://www.perplexity.ai/perplexity-user.json",
  "AWS ip-ranges": "https://ip-ranges.amazonaws.com/ip-ranges.json",
};
const n = (ip) => ip.split(".").reduce((a, b) => a * 256 + Number(b), 0);
const contiene = (cidr, ip) => { const [b, m] = cidr.split("/"); const t = 2 ** (32 - Number(m)); const s = n(b); return n(ip) >= s && n(ip) < s + t; };
const OBJ = ["16.216.88.1", "16.216.88.128", "16.216.88.254"];
for (const [nombre, url] of Object.entries(FUENTES)) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "yump-diagnostico" } });
    if (!r.ok) { console.log(`${nombre.padEnd(42)} HTTP ${r.status}`); continue; }
    const j = await r.json();
    const pref = (j.prefixes ?? []).map((p) => p.ipv4Prefix ?? p.ip_prefix).filter(Boolean);
    const hits = pref.filter((c) => OBJ.some((ip) => contiene(c, ip)));
    const s16 = pref.filter((c) => c.startsWith("16.2"));
    console.log(`${nombre.padEnd(42)} rangos=${String(pref.length).padEnd(6)} ${j.creationTime ?? j.syncToken ?? ""} contiene=${JSON.stringify(hits)} ${hits.length && j.prefixes ? JSON.stringify(j.prefixes.filter((p) => hits.includes(p.ipv4Prefix ?? p.ip_prefix)).slice(0, 3)) : ""} 16.2*=${s16.length}`);
  } catch (e) { console.log(`${nombre.padEnd(42)} error ${e.message}`); }
}
for (const u of ["https://rdap.arin.net/registry/ip/16.216.88.1", "https://rdap.db.ripe.net/ip/16.216.88.1"]) {
  try {
    const r = await fetch(u, { headers: { accept: "application/rdap+json" }, redirect: "follow" });
    const j = await r.json();
    const ent = (j.entities ?? []).map((e) => ({ h: e.handle, r: e.roles, n: e.vcardArray?.[1]?.find((x) => x[0] === "fn")?.[3] }));
    console.log(`RDAP ${u.split("/")[2]} ${r.status} ${j.handle} ${j.name} ${j.startAddress}–${j.endAddress} ${j.type ?? ""} ${j.country ?? ""} ${JSON.stringify(ent).slice(0, 400)} eventos=${JSON.stringify((j.events ?? []).map((e) => e.eventAction + ":" + e.eventDate)).slice(0, 180)}`);
  } catch (e) { console.log(`RDAP ${u} error ${e.message}`); }
}
const r = new dns.Resolver(); r.setServers(["8.8.8.8"]);
for (const ip of ["16.216.88.1", "16.216.88.10", "16.216.88.50", "16.216.88.100", "16.216.88.200"]) {
  try { console.log("PTR", ip, await r.reverse(ip)); } catch (e) { console.log("PTR", ip, e.code); }
}
