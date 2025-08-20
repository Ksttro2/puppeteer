import puppeteer from "puppeteer";
import fs from "fs";
import clipboard from 'clipboardy';
import { PNG } from "pngjs";

// Función para encontrar coordenadas de una imagen dentro de la pantalla
async function findImageCoordinates(page, targetImagePath) {
  await page.screenshot({ path: "fullpage.png", fullPage: true });

  const fullImage = PNG.sync.read(fs.readFileSync("fullpage.png"));
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
              match = false;
              break;
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

const credenciales = [
  { usuario: "admin", password: "Gpon2016CLARO!" },
  { usuario: "admin@claro", password: "Gpon2016CLARO!" }
];

async function openWebPage() {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      '--ssl-version-min=tls1',
      '--disable-features=BlockInsecurePrivateNetworkRequests',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  try {
    await page.goto("https://10.177.120.153", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Saltar advertencia de seguridad si aparece
    try {
      await page.waitForSelector("#details-button", { timeout: 5000 });
      await page.click("#details-button");
      await page.waitForSelector("#proceed-link", { timeout: 5000 });
      await page.click("#proceed-link");
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
      console.log("➡️ Saltó advertencia SSL");
    } catch (err) {
      console.log("⚠️ Advertencia SSL no apareció o ya fue pasada.");
    }

    let loginExitoso = false;

    for (let i = 0; i < credenciales.length; i++) {
      const cred = credenciales[i];
      console.log(`🔐 Probando login con: ${cred.usuario}`);

      await page.waitForSelector("#Frm_Username", { timeout: 5000 });
      await page.waitForSelector("#Frm_Password", { timeout: 5000 });

      // Limpiar campos
      await page.click("#Frm_Username", { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.click("#Frm_Password", { clickCount: 3 });
      await page.keyboard.press('Backspace');

      // Ingresar usuario y contraseña
      await page.type("#Frm_Username", cred.usuario, { delay: 50 });
      await page.type("#Frm_Password", cred.password, { delay: 50 });

      // Hacer login
      await Promise.all([
        page.click("#LoginId"),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
      ]);

      const url = page.url();
      if (url.includes("start.ghtml")) {
        console.log(`✅ Login exitoso con: ${cred.usuario}`);
        loginExitoso = true;
        break;
      } else {
        console.log(`❌ Falló login con: ${cred.usuario}`);

        await page.goto("https://10.177.120.153", {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });

        try {
          await page.waitForSelector("#details-button", { timeout: 3000 });
          await page.click("#details-button");
          await page.waitForSelector("#proceed-link", { timeout: 3000 });
          await page.click("#proceed-link");
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          console.log("🔁 Advertencia SSL reapareció y fue saltada.");
        } catch (e) {
          // No apareció, continuar
        }
      }
    }

    if (!loginExitoso) {
      console.log("❌ Ninguna credencial funcionó.");
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 🔍 Buscar botón 'Security' por imagen
    const coords = await findImageCoordinates(page, 'security_button.png');
    if (coords) {
      console.log(`📍 Coordenadas detectadas: x=${coords.x}, y=${coords.y}`);
      await page.mouse.click(coords.x, coords.y);
      console.log("🛡️ Hizo clic en 'Security'");
    } else {
      console.log("❌ No se encontró la imagen del botón 'Security'.");
      return;
    }

    // ✅ Validar y marcar checkbox si no está marcado
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

      const coords = await findImageCoordinates(page, 'envio.png');

      if (coords) {
        console.log("☑️ El checkbox ya está activado (envio.png encontrado), no se hace clic.");
      } else {
        console.log("🔁 No se encontró envio.png, buscando sinenvio.png...");

        const fallbackCoords = await findImageCoordinates(page, 'sinenvio.png');
        if (fallbackCoords) {
          console.log(`📍 Coordenadas detectadas: x=${fallbackCoords.x}, y=${fallbackCoords.y}`);
          await page.mouse.click(fallbackCoords.x, fallbackCoords.y);
          console.log("✅ Hizo clic en el checkbox (sinenvio.png)");
          hizoClickEnSinEnvio = true;
        } else {
          console.log("❌ No se encontró ninguna de las dos imágenes.");
        }
      }
    }

    // Solo si se hizo clic en sinenvio.png, hacer clic en enviar
    if (hizoClickEnSinEnvio) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const enviar = await findImageCoordinates(page, 'enviar.png');
      if (enviar) {
        console.log(`📍 Coordenadas detectadas: x=${enviar.x}, y=${enviar.y}`);
        await page.mouse.click(enviar.x, enviar.y);
        console.log("📤 Hizo clic en 'botón enviar'");
      } else {
        console.log("❌ No se encontró la imagen del botón 'enviar'.");
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    const enviado = await findImageCoordinates(page, 'administracion.png');
    if (enviado) {
      console.log(`📍 Coordenadas detectadas: x=${enviado.x}, y=${enviado.y}`);
      await page.mouse.click(enviado.x, enviado.y);
      console.log("📤 Hizo clic en 'administracion'");
    } else {
      console.log("❌ No se encontró la imagen del botón 'administracion'.");
    }

    // ====== INICIO TR-069 integrado ======
    // Reemplazar el contenido del input #Frm_URL dentro del iframe mainFrame
    async function getMainFrame(page) {
      // A veces tarda en anexar el frame al DOM
      for (let i = 0; i < 20; i++) {
        const f = page.frames().find(fr => fr.name() === 'mainFrame');
        if (f) return f;
        await page.waitForTimeout(250);
      }
      throw new Error('No encontré el iframe mainFrame');
    }

    async function setFrmURLValue(page, newValue) {
      const frame = await getMainFrame(page);

      // Asegurar que el input existe y está visible
      const elHandle = await frame.waitForSelector('#Frm_URL', { visible: true, timeout: 15000 });

      // 1) Scroll + foco
      await elHandle.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await elHandle.focus();

      // 2) Intento por “tecleado humano”: triple click + Backspace
      try {
        await elHandle.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await frame.type('#Frm_URL', newValue, { delay: 20 });

        // Disparar eventos que algunos formularios requieren
        await frame.evaluate(() => {
          const inp = document.querySelector('#Frm_URL');
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Forzar blur con Tab (algunos UIs guardan al perder foco)
        await page.keyboard.press('Tab');
        console.log('✅ Escribí con triple-click + Backspace + type()');
      } catch (e) {
        console.log('⚠️ Falló método por tecleo. Probando asignación directa...', e.message);

        // 3) Intento por asignación directa + eventos
        await frame.evaluate((val) => {
          const inp = document.querySelector('#Frm_URL');
          if (!inp) throw new Error('No existe #Frm_URL');
          // limpiar
          inp.value = '';
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          // setear
          inp.value = val;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.blur();
        }, newValue);

        console.log('✅ Asigné por DOM con eventos input/change/blur');
      }

      // 4) Verificación (log en consola)
      const finalVal = await frame.$eval('#Frm_URL', el => el.value);
      console.log('🔎 Valor final #Frm_URL =', finalVal);
      if (finalVal !== newValue) {
        throw new Error(`El campo no quedó con el valor esperado. Actual: "${finalVal}"`);
      }
    }

    // === Llamada:
    await new Promise(resolve => setTimeout(resolve, 10000));
    await setFrmURLValue(page, 'hola');
      // ====== FIN TR-069 integrado ======

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    // await browser.close();
  }
}

openWebPage();
