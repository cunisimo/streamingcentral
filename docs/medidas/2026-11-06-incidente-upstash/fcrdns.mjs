// Confirmación directa e inversa del DNS: el nombre tiene que volver a la misma IP.
import dns from "node:dns/promises";
const r = new dns.Resolver(); r.setServers(["8.8.8.8"]);
for (const ip of ["16.216.88.1", "16.216.88.10", "16.216.88.50", "16.216.88.100", "16.216.88.200", "16.216.89.1", "16.216.87.1", "16.216.90.1"]) {
  try {
    const nombres = await r.reverse(ip);
    const ida = await Promise.all(nombres.map((n) => r.resolve4(n).catch((e) => [e.code])));
    console.log(ip, nombres.join(","), "→", JSON.stringify(ida), ida.flat().includes(ip) ? "CONFIRMADA" : "NO coincide");
  } catch (e) { console.log(ip, "sin PTR:", e.code); }
}
for (const u of ["https://reflection.ai/robots.txt", "https://reflection.ai/bot", "https://reflection.ai/reflectionbot", "https://reflection.ai/crawler", "https://reflection.ai/bot.json", "https://reflection.ai/reflectionbot.json"]) {
  try { const x = await fetch(u, { redirect: "follow", headers: { "user-agent": "yump-diagnostico" } }); const t = await x.text(); console.log(u, x.status, x.headers.get("content-type"), t.length, /reflectionbot/i.test(t) ? "menciona ReflectionBot" : ""); } catch (e) { console.log(u, "error", e.message); }
}
