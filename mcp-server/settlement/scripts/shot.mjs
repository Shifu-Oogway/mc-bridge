// Teleport to a viewpoint (creative), wait for chunks, capture the screen at half size.
//   node settlement/scripts/shot.mjs name x y z lookX lookY lookZ
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { execFileSync } from "node:child_process";
const [name, x, y, z, lx, ly, lz] = process.argv.slice(2);
const inst = path.join(os.homedir(), "curseforge", "minecraft", "Instances", "Create - Perfect World Post Production - Better FPS");
const conn = JSON.parse(fs.readFileSync(path.join(inst, "mcbridge", "connection.json"), "utf8"));
await fetch(`http://${conn.host}:${conn.port}/chat`, { method: "POST", headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: `/tp @s ${x} ${y} ${z} facing ${lx} ${ly} ${lz}` }) });
await new Promise((r) => setTimeout(r, 3500));
const out = path.join(process.env.SHOTS ?? ".", `${name}.png`);
execFileSync("powershell", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $s=New-Object System.Drawing.Bitmap $bmp,([int]($b.Width/2)),([int]($b.Height/2)); $s.Save('${out}',[System.Drawing.Imaging.ImageFormat]::Png)`]);
console.log(out);
