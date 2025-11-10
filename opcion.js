// opcion.js
import puppeteer from "puppeteer";
import fs from "fs";
import clipboard from "clipboardy";
import { PNG } from "pngjs";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

// ===== Utiles de ruta (ESM) =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Leer Excel: informacion.xlsx -> columna "IP" (comas -> puntos) =====
const excelPath = path.join(__dirname, "informacion.xlsx");
let ips = [];
try {
  const wb = XLSX.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  // Detecta la columna "IP" sin depender de may/min y espacios
  const ipKey =
    (rows[0] && Object.keys(rows[0]).find(k => k.trim().toLowerCase() === "ip")) || "IP";

  ips = rows
    .map(r => normalizarIP(String(r[ipKey] ?? "").trim()))
    .filter(Boolean);

  console.log(`📊 IPs cargadas de Excel: ${ips.length}`);
  if (ips.length) console.log("Ejemplo:", ips[0]);
} catch (e) {
  console.log("⚠️ No pude leer informacion.xlsx:", e.message);
}

// Convierte "10,177,120,153" -> "10.177.120.153" y valida IPv4
function normalizarIP(v) {
  if (!v) return null;
  v = v.replace(/^\s*(https?:\/\/)/i, "").split(/[\/\s]/)[0]; // quita protocolo/paths
  v = v.split(":")[0]; // quita puerto
  v = v.replace(/,/g, "."); // comas -> puntos
  const m = v.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (!m) return null;
  const oct = v.split(".").map(Number);
  if (oct.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return oct.join(".");
}

// ===== Buscar coordenadas por imagen en screenshot de la página =====
async function findImageCoordinates(page, targetImagePath) {
  await page.screenshot({ path: "img/fullpage.png", fullPage: true });

  const fullImage = PNG.sync.read(fs.readFileSync("img/fullpage.png"));
  const target = PNG.sync.read(fs.readFileSync(targetImagePath));

  const { width: fw, height: fh } = fullImage;
  const { width: tw, height: th } = target;

  for (let y = 0; y <= fh - th; y++) {
    for (let x = 0; x <= fw - tw; x++) {
      let match = true;
      for (let ty = 0; ty < th; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          const fullIdx = ((y + ty) * fw + (x + tx)) * 4;
          const targetIdx = (ty * tw + tx) * 4;
          for (let i = 0; i < 4; i++) {
            if (Math.abs(fullImage.data[fullIdx + i] - target.data[targetIdx + i]) > 20) {
              match = false; break;
            }
          }
          if (!match) break;
        }
        if (!match) break;
      }
      if (match) {
        return { x: x + tw / 2, y: y + th / 2 };
      }
    }
  }
  return null;
}

// ===== Credenciales =====
const credenciales = [
  { usuario: "admin@claro", password: "Gpon2016CLARO!" },
  { usuario: "admin", password: "Gpon2016CLARO!" }
];

const credenciales80 = [
  {"usuario": "claro@admin", "password": "Cl4r04lT3rn4t1v02019*"},
  {"usuario": "admin@claro", "password": "Gp0n2019CL4R0!"}
];

// ===== Abre https://IP, salta SSL y prueba logins =====
async function abrirYLoguear(page, ip, credenciales) {



  console.log(`🌐 Abriendo https://${ip}`);
  await page.goto(`http://${ip}`, { waitUntil: "domcontentloaded", timeout: 20000 });

  // Saltar advertencia SSL si aparece
  try {
    await page.waitForSelector("#details-button", { timeout: 5000 });
    await page.click("#details-button");
    await page.waitForSelector("#proceed-link", { timeout: 5000 });
    await page.click("#proceed-link");
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });
    console.log("➡️ Saltó advertencia SSL");
  } catch {
    console.log("⚠️ Advertencia SSL no apareció o ya fue pasada.");
  }

  const titulo = await page.title();
  console.log(`📄 Título de la página: ${titulo}`);
  // Probar credenciales
  for (const cred of credenciales) {
    console.log(`Probando login con: ${cred.usuario}`);
    await page.waitForSelector("#Frm_Username", { timeout: 10000 });
    await page.waitForSelector("#Frm_Password", { timeout: 10000 });

    // Limpiar + escribir
    await page.click("#Frm_Username", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.click("#Frm_Password", { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type("#Frm_Username", cred.usuario, { delay: 50 });
    await page.type("#Frm_Password", cred.password, { delay: 50 });

    await Promise.all([
      page.click("#LoginId"),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {})
    ]);

    if (page.url().includes("start.ghtml")) {
      console.log(`✅ Login exitoso con: ${cred.usuario}`);
      return true;
    }
    console.log(`❌ Falló login con: ${cred.usuario}`);

    // Reintentar desde la raíz para siguiente intento
    await page.goto(`https://${ip}`, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
  }

  return false;
}

// ===== Helpers de frame / inputs / selects / checkbox / submit =====
async function waitForMainFrame(page, timeout = 15000) {
  const step = 250;
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const byName = page.frames().find(f => f.name() === "mainFrame");
    if (byName) return byName;
    const handle = await page.$('iframe[name="mainFrame"], iframe#mainFrame');
    if (handle) {
      const fr = await handle.contentFrame();
      if (fr) return fr;
    }
    await page.waitForTimeout(step);
  }
  throw new Error("No encontré el iframe mainFrame");
}

async function setInput(frame, selector, newValue) {
  const el = await frame.waitForSelector(selector, { visible: true, timeout: 15000 });
  await el.evaluate(n => n.scrollIntoView({ block: "center" }));
  await el.focus();

  try {
    await el.click({ clickCount: 3 });
    await el.press("Backspace");
    await frame.type(selector, newValue, { delay: 20 });
    await frame.evaluate((sel) => {
      const inp = document.querySelector(sel);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector);
  } catch (e) {
    await frame.evaluate((sel, val) => {
      const inp = document.querySelector(sel);
      if (!inp) throw new Error(`No existe ${sel}`);
      inp.value = "";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.value = val;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      inp.blur();
    }, selector, newValue);
  }

  const finalVal = await frame.$eval(selector, n => n.value);
  console.log(`🔎 ${selector} =`, finalVal);
  if (String(finalVal) !== String(newValue)) {
    throw new Error(`No quedó el valor esperado en ${selector} (actual: "${finalVal}")`);
  }
}

async function setSelect(frame, selector, { value, text } = {}) {
  await frame.waitForSelector(selector, { visible: true, timeout: 15000 });

  let selected = null;
  if (value) {
    const res = await frame.select(selector, value);
    selected = res?.[0] ?? null;
  }
  if (!selected && text) {
    selected = await frame.evaluate((sel, wanted) => {
      const el = document.querySelector(sel);
      const opt = Array.from(el.options).find(o => o.textContent.trim() === wanted);
      if (opt) {
        el.value = opt.value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return opt.value;
      }
      return null;
    }, selector, text);
  }

  await frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector);

  const fin = await frame.$eval(selector, el => ({
    value: el.value,
    text: el.options[el.selectedIndex]?.textContent?.trim(),
  }));
  console.log(`🔎 ${selector} => value:${fin.value}, text:${fin.text}`);
  if (!fin.value) throw new Error(`No se pudo seleccionar en ${selector}`);
}

async function ensureCheckbox(frame, selector, shouldBeChecked = true) {
  await frame.waitForSelector(selector, { visible: true, timeout: 15000 });
  const current = await frame.$eval(selector, el => el.checked);
  if (current !== shouldBeChecked) {
    await frame.click(selector);
    await frame.evaluate((sel) => {
      const el = document.querySelector(sel);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector);
  }
  const now = await frame.$eval(selector, el => el.checked);
  console.log(`🔎 ${selector} checked=${now}`);
  if (now !== shouldBeChecked) throw new Error(`No se pudo cambiar el estado de ${selector}`);
}

async function clickSubmit(frame, page) {
  const btn = await frame.waitForSelector("#Btn_Submit", { visible: true, timeout: 15000 });
  await btn.evaluate(el => el.scrollIntoView({ block: "center" }));
  await btn.focus();
  await btn.click({ delay: 50 });

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await Promise.race([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 4000 }).catch(() => {}),
    sleep(1000),
  ]);

  const stillThere = await frame.$("#Btn_Submit");
  if (stillThere) {
    await frame.evaluate(() => {
      const b = document.querySelector("#Btn_Submit");
      b?.click();
      if (typeof window.pageSubmit === "function") {
        window.pageSubmit();
      }
    });
  }
  console.log("📤 Click en Submit enviado");
}

// ===== Helpers de menú =====
async function clickSecurity(frame) {
  const tdSel = "#mmSec";
  const fontSel = "#Fnt_mmSec";

  const td = await frame.waitForSelector(tdSel, { visible: true, timeout: 15000 });
  await td.evaluate(el => el.scrollIntoView({ block: "center" }));

  const symbol = await frame.$eval(tdSel, el => el.querySelector(".menuPlusSymbol")?.textContent?.trim() || "");
  if (symbol === "+") {
    await td.click();
    await frame.waitForFunction((sel) => {
      const s = document.querySelector(sel)?.querySelector(".menuPlusSymbol");
      return s && s.textContent.trim() !== "+";
    }, {}, tdSel);
  } else {
    if (await frame.$(fontSel)) await frame.click(fontSel);
    else await td.click();
  }
  console.log('✅ "Security" expandido/seleccionado');
}

async function getMenuFrame(page, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const fr of page.frames()) {
      try {
        const hasMenu = await fr.evaluate(() => {
          return !!(
            document.querySelector('#mmSec') ||
            document.querySelector('#smSerCon') ||
            Array.from(document.querySelectorAll('font,td,span'))
              .some(el => el.textContent.trim() === 'TR-069')
          );
        });
        if (hasMenu) return fr;
      } catch {}
    }
    await page.waitForTimeout(250);
  }
  throw new Error("No encontré el frame del menú");
}


// ===== Flujo principal =====
async function openWebPage() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // ✅ usa tu Chrome real
    ignoreHTTPSErrors: true,
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--allow-insecure-localhost",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process", // ✅ evita aislamiento de red
      "--disable-features=BlockInsecurePrivateNetworkRequests", // ✅ permite HTTP -> IP local
    ],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    for (const ip of ips) {
      try {

        const ok = await abrirYLoguear(page, ip, credenciales);
        if (!ok) {
          console.log(`⛔ No se pudo iniciar sesión en ${ip}. Continúo con la siguiente.`);
          continue;
        }

        await new Promise(r => setTimeout(r, 2000));

        // 🔍 Buscar botón 'Security' por imagen
        const secCoords = await findImageCoordinates(page, path.join(__dirname, "img/security_button.png"));
        if (secCoords) {
          console.log(`📍 Coordenadas 'Security': x=${secCoords.x}, y=${secCoords.y}`);
          await page.mouse.click(secCoords.x, secCoords.y);
          console.log("🛡️ Hizo clic en 'Security'");
        } else {
          console.log("❌ No se encontró la imagen del botón 'Security'.");
          continue;
        }

        // ✅ Checkbox Frm_IsProtect (si existe en este paso de tu UI)
        let hizoClickEnSinEnvio = false;
        try {
          await page.waitForSelector("#Frm_IsProtect", { timeout: 10000 });
          const isChecked = await page.$eval("#Frm_IsProtect", el => el.checked);
          if (!isChecked) {
            await page.click("#Frm_IsProtect");
            console.log("✅ Checkbox seleccionado desde DOM");
          } else {
            console.log("☑️ Checkbox ya estaba seleccionado");
          }
        } catch (err) {
          console.log("⚠️ No se pudo acceder al checkbox directamente, intentando con imagen...");
          const coordsEnv = await findImageCoordinates(page, path.join(__dirname, "img/envio.png"));
          if (coordsEnv) {
            console.log("☑️ El checkbox ya está activado (envio.png encontrado), no se hace clic.");
          } else {
            console.log("🔁 No se encontró envio.png, buscando sinenvio.png...");
            const coordsSin = await findImageCoordinates(page, path.join(__dirname, "img/sinenvio.png"));
            if (coordsSin) {
              await page.mouse.click(coordsSin.x, coordsSin.y);
              console.log("✅ Hizo clic en el checkbox (sinenvio.png)");
              hizoClickEnSinEnvio = true;
            } else {
              console.log("❌ No se encontró ninguna de las dos imágenes.");
            }
          }
        }

        if (hizoClickEnSinEnvio) {
          await new Promise(r => setTimeout(r, 3000));
          const enviar = await findImageCoordinates(page, path.join(__dirname, "img/enviar.png"));
          if (enviar) {
            await page.mouse.click(enviar.x, enviar.y);
            console.log("📤 Hizo clic en 'botón enviar'");
          } else {
            console.log("❌ No se encontró la imagen del botón 'enviar'.");
          }
          await new Promise(r => setTimeout(r, 10000));
        }

        const admin = await findImageCoordinates(page, path.join(__dirname, "img/administracion.png"));
        if (admin) {
          await page.mouse.click(admin.x, admin.y);
          console.log("📤 Hizo clic en 'administracion'");
        } else {
          console.log("❌ No se encontró la imagen del botón 'administracion'.");
        }

        // ====== INICIO TR-069 integrado ======
        await new Promise(r => setTimeout(r, 10000));
        const frame = await waitForMainFrame(page);

        // SELECT: escoger INTERNET_TR069 (value IGD.WD1.WCD1.WCIP1)
        await setSelect(frame, "#Frm_DefaultWan", { value: "IGD.WD1.WCD1.WCIP1", text: "INTERNET_TR069" });

        // INPUTS
        await setInput(frame, "#Frm_URL", "http://100.70.133.132:8080/ftacs-basic/ACS");
        await setInput(frame, "#Frm_UserName", "Claroadmin");
        await setInput(frame, "#Frm_UserPassword", "Cl4r0@dm1n");
        await setInput(frame, "#Frm_ConnectionRequestUsername", "admin");
        await setInput(frame, "#Frm_ConnectionRequestPassword", "cla-acs-cl3-4cs");
 
        // CHECKBOX: marcar si no está seleccionado
        await ensureCheckbox(frame, "#Frm_PeriodicInformEnable", true);

        // INTERVALO
        await setInput(frame, "#Frm_PeriodicInformInterval", "86400");

        await clickSubmit(frame, page);


        await new Promise(r => setTimeout(r, 10000));

        // 🔍 Buscar botón 'Security' por imagen
        const seguriti = await findImageCoordinates(page, path.join(__dirname, "img/security_button.png"));
        if (seguriti) {
          console.log(`📍 Coordenadas 'Security': x=${seguriti.x}, y=${seguriti.y}`);
          await page.mouse.click(seguriti.x, seguriti.y);
          console.log("🛡️ Hizo clic en 'Security'");
        } else {
          console.log("❌ No se encontró la imagen del botón 'Security'.");
          continue;
        }

        // Ingreso a servicio de control:
        console.log("Validando imagen");
        await new Promise(r => setTimeout(r, 10000));
        const enviar = await findImageCoordinates(page, path.join(__dirname, "img/service.png"));
        if (enviar) {
          await page.mouse.click(enviar.x, enviar.y);
          console.log("📤 Hizo clic en 'botón enviar'");
        } else {
          console.log("❌ No se encontró la imagen del botón 'service_control'.");
        }
  /// inTEGRO DE LAS TABLAS
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        await new Promise(r => setTimeout(r, 5000));
        const botones = await frame.$$eval('input[id^="Btn_Modify"]', els =>
          els.map(e => ({
            id: e.id,
            onclick: e.getAttribute("onclick")
          }))
        );

        console.log(`🔍 Se encontraron ${botones.length} botones Modify():`, botones);

        if (botones.length === 0) {
          console.log("⚠️ No se encontró ningún botón Modify().");
        } else {
          for (let i = 0; i < botones.length; i++) {
            const { id } = botones[i];
            console.log(`➡️ Abriendo formulario ${id} (${i + 1}/${botones.length})`);

            // 1) Abrir el formulario de la fila i
            await frame.click(`#${id}`);
            // Espera a que cargue el formulario
            await frame.waitForSelector('#Frm_INCViewName', { visible: true, timeout: 15000 });

            // 2) Seleccionar WAN
            await frame.select('#Frm_INCViewName', 'IGD.WANIF');
            console.log('✅ Seleccionó "WAN" en Frm_INCViewName');

            // 3) Llenar IPs
            await frame.$eval('#Frm_MinSrcIp', (el, val) => { el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }, '172.31.0.1');
            await frame.$eval('#Frm_MaxSrcIp', (el, val) => { el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }, '172.31.255.254');
            console.log('✅ Se llenaron los campos de IPs');

            // 4) Activar checkbox HTTP si no está marcado
            await frame.waitForSelector('#ServiceType0', { visible: true, timeout: 10000 });
            const httpChecked = await frame.$eval('#ServiceType0', el => el.checked);
            if (!httpChecked) {
              await frame.click('#ServiceType0');
              console.log('✅ Checkbox HTTP activado');
            } else {
              console.log('☑️ Checkbox HTTP ya estaba activado');
            }

            // 5) Guardar con el botón Modify del formulario
            const modifyBtn = await frame.$('#modify');
            if (modifyBtn) {
              // Hacer clic y esperar una señal razonable de guardado (texto o refresh ligero)
              await Promise.race([
                (async () => {
                  await modifyBtn.click();
                  // espera a que el botón se deshabilite o desaparezca o aparezca texto de éxito
                  await frame.waitForFunction(() => {
                    const b = document.querySelector('#modify');
                    const okMsg = /success|saved|actualizado|exitos/i.test(document.body.innerText || "");
                    return !b || b.disabled || okMsg;
                  }, { timeout: 8000 }).catch(() => {});
                })(),
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {})
              ]);

              console.log('💾 Guardado enviado para este formulario');
              await sleep(3000);
            } else {
              console.log('⚠️ No se encontró el botón #modify dentro del formulario');
            }

           await new Promise(r => setTimeout(r, 1000));
          }

          console.log('✅ Terminó de procesar todos los formularios Modify encontrados.');
        }


      } catch (err) {
        console.log(`💥 Error procesando ${ip}:`, err.message);
      }
    }
  } catch (error) {
    console.error("❌ Error general:", error.message);
  } finally {
    // await browser.close();
  }
}

openWebPage();
